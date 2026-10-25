// The main-process plugin loader against a real temp directory exposed as `ctx.vault`.
// Fixture plugins are plain ESM files written into that directory; they log into
// `globalThis.__loaderLog`, which is how the tests observe apply/dispose ordering.
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@diabase/kernel'
import type { PluginStatus } from '@diabase/kernel'
import { PluginLoader } from '@diabase/kernel/main'
import type { Importer } from '@diabase/kernel/main'
import type { VaultEvent } from '@diabase/protocol'
import { FsVault } from './helpers/fs-vault.ts'

declare global {
  var __loaderLog: unknown[][]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(check: () => boolean, ms = 2000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition')
    await sleep(5)
  }
}

/** A plugin module that records `eval`, `apply` and `dispose` under `tag`. */
const fixture = (tag: string, { body = '', inject = '' } = {}) => `
globalThis.__loaderLog.push(['eval', '${tag}'])
export default {
  name: 'fixture-${tag}',${inject ? `\n  inject: ${inject},` : ''}
  apply(ctx, config) {
    ${body}
    globalThis.__loaderLog.push(['apply', '${tag}', config])
    ctx.effect(() => () => globalThis.__loaderLog.push(['dispose', '${tag}']))
  },
}
`

const manifest = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ id, name: id, version: '1.0.0', main: 'index.mjs', ...extra })

const yamlConfig = (plugins: Record<string, string | null>) =>
  'plugins:\n' +
  Object.entries(plugins)
    .map(([id, body]) => `  ${id}:${body === null ? '' : '\n' + body.replace(/^/gm, '    ')}`)
    .join('\n') +
  '\n'

describe('plugin loader', () => {
  let base: string
  let vaultDir: string
  let root: Context
  let fibers: Array<{ dispose(): Promise<void> | void }>

  const put = async (rel: string, content: string) => {
    const file = path.join(vaultDir, rel)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, content)
  }
  const pluginDir = (name: string) => `.diabase/plugins/${name}`
  /** Installs `index.mjs` + manifest under `.diabase/plugins/<name>`. */
  const install = async (name: string, tag = name, extraManifest: Record<string, unknown> = {}, code: Parameters<typeof fixture>[1] = {}) => {
    await put(`${pluginDir(name)}/diabase.plugin.json`, manifest(name, extraManifest))
    await put(`${pluginDir(name)}/index.mjs`, fixture(tag, code))
  }
  const configure = (plugins: Record<string, string | null>) => put('.diabase/config.yml', yamlConfig(plugins))
  const touch = (...paths: string[]) =>
    root.emit(
      'vault/changed',
      paths.map((p): VaultEvent => ({ type: 'change', path: p, hash: 'sha256-x', origin: 'external' })),
    )
  const pluginListCalls = () => (root.vault as unknown as FsVault).calls.list!.filter((d) => d === '.diabase/plugins').length
  const status = (id: string): PluginStatus => {
    const found = root.loader.list().find((s) => s.id === id)
    if (!found) throw new Error(`no plugin ${id} in ${JSON.stringify(root.loader.list().map((s) => s.id))}`)
    return found
  }
  const log = () => globalThis.__loaderLog.map((entry) => entry.slice(0, 2).join(':'))

  const start = async (options: { debounce?: number; importer?: Importer } = {}) => {
    const vault = root.plugin(FsVault, { root: vaultDir })
    await vault
    const loader = root.plugin(PluginLoader, { root: vaultDir, debounce: 20, ...options })
    await loader
    fibers.push(loader, vault)
    return { vault, loader }
  }

  beforeEach(async () => {
    globalThis.__loaderLog = []
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'diabase-loader-'))
    vaultDir = path.join(base, 'vault')
    await fs.mkdir(vaultDir)
    root = new Context()
    fibers = []
  })

  afterEach(async () => {
    for (const fiber of fibers.splice(0)) {
      try {
        await fiber.dispose()
      } catch {}
    }
    await fs.rm(base, { recursive: true, force: true })
  })

  describe('discovery and loading', () => {
    it('has no plugins and no config error when .diabase is missing', async () => {
      await start()
      expect(root.loader.list()).toEqual([])
      expect(root.loader.renderers()).toEqual([])
      expect(root.loader.configError()).toBeNull()
    })

    it('loads an enabled plugin with its config', async () => {
      await install('hello')
      await configure({ hello: 'config:\n  greeting: hi\n  nested: { n: 1 }' })
      await start()
      expect(globalThis.__loaderLog).toEqual([
        ['eval', 'hello'],
        ['apply', 'hello', { greeting: 'hi', nested: { n: 1 } }],
      ])
      expect(status('hello')).toMatchObject({
        id: 'hello',
        dir: '.diabase/plugins/hello',
        enabled: true,
        state: 'active',
        main: '.diabase/plugins/hello/index.mjs',
      })
      expect(status('hello').manifest?.name).toBe('hello')
    })

    it('treats a bare "hello:" and an empty config file as valid', async () => {
      await install('hello')
      await put('.diabase/config.yml', 'plugins:\n  hello:\n')
      await start()
      expect(status('hello').state).toBe('active')
      expect(globalThis.__loaderLog).toContainEqual(['apply', 'hello', undefined])

      await put('.diabase/config.yml', '')
      await root.loader.reload()
      expect(root.loader.configError()).toBeNull()
      expect(status('hello')).toMatchObject({ state: 'disabled', enabled: false })
      expect(log()).toEqual(['eval:hello', 'apply:hello', 'dispose:hello'])
    })

    it('does not load unlisted or enabled: false plugins', async () => {
      await install('listed')
      await install('off')
      await install('unlisted')
      await configure({ listed: null, off: 'enabled: false' })
      await start()
      expect(log()).toEqual(['eval:listed', 'apply:listed'])
      expect(status('listed').state).toBe('active')
      expect(status('off')).toMatchObject({ state: 'disabled', enabled: false })
      expect(status('unlisted')).toMatchObject({ state: 'disabled', enabled: false })
    })

    it('marks unusable manifests invalid with a readable error', async () => {
      await put(`${pluginDir('bad-json')}/diabase.plugin.json`, '{ nope')
      await put(`${pluginDir('bad-schema')}/diabase.plugin.json`, JSON.stringify({ id: 'Not Valid', name: 'x', version: '1' }))
      await put(`${pluginDir('no-manifest')}/index.mjs`, 'export default {}')
      await put(`${pluginDir('a-file')}`, 'not a directory') // plain files in plugins/ are ignored
      await configure({ 'bad-json': null, 'bad-schema': null, 'no-manifest': null })
      await start()
      expect(root.loader.list().map((s) => [s.id, s.state])).toEqual([
        ['bad-json', 'invalid'],
        ['bad-schema', 'invalid'],
        ['no-manifest', 'invalid'],
      ])
      expect(status('bad-json').error).toMatch(/not valid JSON/)
      expect(status('bad-schema').error).toMatch(/invalid diabase\.plugin\.json: id:/)
      expect(status('no-manifest').error).toMatch(/missing diabase\.plugin\.json/)
      expect(status('bad-json').manifest).toBeNull()
      expect(globalThis.__loaderLog).toEqual([])
    })

    it('refuses entries that are not plain relative paths inside the plugin dir', async () => {
      await fs.mkdir(path.join(base, 'outside'))
      await fs.writeFile(path.join(base, 'outside', 'evil.mjs'), fixture('evil'))
      await fs.writeFile(path.join(base, 'evil.js'), fixture('evil'))
      const cases: Record<string, string> = {
        'dotdot': '../evil.js',
        'dotdot-inner': 'sub/../../evil.js',
        'absolute': path.join(base, 'evil.js'),
        'backslash': 'sub\\index.mjs',
        'drive': 'C:index.mjs',
        'empty': '',
        'directory': 'sub/',
        'link': 'link.mjs',
        'dirlink': 'escape/evil.mjs',
        'missing': 'nope.mjs',
      }
      for (const [name, main] of Object.entries(cases)) {
        await put(`${pluginDir(name)}/diabase.plugin.json`, manifest(name, { main }))
        await put(`${pluginDir(name)}/sub/index.mjs`, fixture(name))
        await fs.symlink(path.join(base, 'outside', 'evil.mjs'), path.join(vaultDir, pluginDir(name), 'link.mjs'))
        await fs.symlink(path.join(base, 'outside'), path.join(vaultDir, pluginDir(name), 'escape'))
      }
      await configure(Object.fromEntries(Object.keys(cases).map((name) => [name, null])))
      const imported: string[] = []
      await start({ importer: async (url) => void imported.push(url) })
      for (const name of Object.keys(cases)) {
        expect(status(name), name).toMatchObject({ state: 'invalid', enabled: true })
        expect(status(name).error, name).toBeTruthy()
        expect(status(name).main, name).toBeUndefined()
      }
      expect(status('link').error).toMatch(/outside the plugin directory/)
      expect(status('dirlink').error).toMatch(/outside the plugin directory/)
      expect(status('missing').error).toMatch(/does not exist/)
      expect(imported).toEqual([])
    })

    it('accepts ./-prefixed and nested entries, normalizing the vault path', async () => {
      await install('nested', 'nested', { main: './dist//main.mjs' })
      await put(`${pluginDir('nested')}/dist/main.mjs`, fixture('nested'))
      await configure({ nested: null })
      await start()
      expect(status('nested')).toMatchObject({ state: 'active', main: '.diabase/plugins/nested/dist/main.mjs' })
    })

    it('marks the later directory invalid on a duplicate manifest id', async () => {
      await put(`${pluginDir('b-dir')}/diabase.plugin.json`, manifest('dup'))
      await put(`${pluginDir('b-dir')}/index.mjs`, fixture('b'))
      await put(`${pluginDir('a-dir')}/diabase.plugin.json`, manifest('dup'))
      await put(`${pluginDir('a-dir')}/index.mjs`, fixture('a'))
      await configure({ dup: null })
      await start()
      expect(root.loader.list().map((s) => [s.id, s.dir, s.state])).toEqual([
        ['dup', '.diabase/plugins/a-dir', 'active'],
        ['b-dir', '.diabase/plugins/b-dir', 'invalid'],
      ])
      expect(status('b-dir').error).toMatch(/duplicate plugin id "dup".*a-dir/)
      expect(log()).toEqual(['eval:a', 'apply:a'])
    })

    it('lists renderer-only plugins as active without importing anything, and exposes renderers()', async () => {
      await install('both', 'both', { renderer: 'ui.mjs' })
      await put(`${pluginDir('both')}/ui.mjs`, 'export default {}')
      await put(`${pluginDir('ui-only')}/diabase.plugin.json`, JSON.stringify({ id: 'ui-only', name: 'u', version: '1', renderer: 'dist/ui.mjs' }))
      await put(`${pluginDir('ui-only')}/dist/ui.mjs`, 'export default {}')
      await install('disabled-ui', 'disabled-ui', { renderer: 'ui.mjs' })
      await put(`${pluginDir('disabled-ui')}/ui.mjs`, 'export default {}')
      await install('main-only', 'main-only')
      await configure({ both: null, 'ui-only': null, 'main-only': null, 'disabled-ui': 'enabled: false' })
      const imported: string[] = []
      await start({ importer: (url) => (imported.push(url), import(/* @vite-ignore */ url)) })
      expect(imported).toHaveLength(2)
      expect(status('ui-only')).toMatchObject({ state: 'active', renderer: '.diabase/plugins/ui-only/dist/ui.mjs' })
      expect(status('ui-only').main).toBeUndefined()
      expect(root.loader.renderers()).toEqual([
        { id: 'both', dir: '.diabase/plugins/both', entry: '.diabase/plugins/both/ui.mjs' },
        { id: 'ui-only', dir: '.diabase/plugins/ui-only', entry: '.diabase/plugins/ui-only/dist/ui.mjs' },
      ])
    })
  })

  describe('load failures', () => {
    it('reports an apply that throws as failed with its message', async () => {
      await install('boom', 'boom', {}, { body: "throw new Error('kaboom')" })
      await configure({ boom: null })
      await start()
      expect(status('boom')).toMatchObject({ state: 'failed', error: 'kaboom' })
    })

    it('reports import errors and non-plugin exports as failed', async () => {
      await put(`${pluginDir('syntax')}/diabase.plugin.json`, manifest('syntax'))
      await put(`${pluginDir('syntax')}/index.mjs`, 'export default {')
      await put(`${pluginDir('shape')}/diabase.plugin.json`, manifest('shape'))
      await put(`${pluginDir('shape')}/index.mjs`, 'export default 42')
      await configure({ syntax: null, shape: null })
      await start()
      expect(status('syntax')).toMatchObject({ state: 'failed' })
      expect(status('syntax').error).toMatch(/^import failed: /)
      expect(status('shape')).toMatchObject({ state: 'failed' })
      expect(status('shape').error).toMatch(/must export a plugin/)
    })

    it('accepts a function default export and a namespace with apply', async () => {
      await put(`${pluginDir('fn')}/diabase.plugin.json`, manifest('fn'))
      await put(`${pluginDir('fn')}/index.mjs`, "export default function (ctx, config) { globalThis.__loaderLog.push(['apply', 'fn', config]) }")
      await put(`${pluginDir('ns')}/diabase.plugin.json`, manifest('ns'))
      await put(`${pluginDir('ns')}/index.mjs`, "export function apply(ctx, config) { globalThis.__loaderLog.push(['apply', 'ns', config]) }")
      await configure({ fn: 'config: { a: 1 }', ns: 'config: { b: 2 }' })
      await start()
      expect(status('fn').state).toBe('active')
      expect(status('ns').state).toBe('active')
      expect(globalThis.__loaderLog).toEqual([
        ['apply', 'fn', { a: 1 }],
        ['apply', 'ns', { b: 2 }],
      ])
    })

    it('reports missing injects as pending and activates once the service appears', async () => {
      await install('needy', 'needy', {}, { inject: "['nope']" })
      await configure({ needy: null })
      let changes = 0
      root.on('loader/changed', () => void changes++)
      await start()
      expect(status('needy')).toMatchObject({ state: 'pending' })
      expect(log()).toEqual(['eval:needy'])
      expect(changes).toBe(1)

      const provider = root.plugin({ name: 'provider', apply: (ctx: Context) => (ctx as any).provide('nope', {}) })
      fibers.push(provider)
      await provider
      await until(() => status('needy').state === 'active')
      expect(log()).toEqual(['eval:needy', 'apply:needy'])

      await provider.dispose()
      await until(() => status('needy').state === 'pending')
      expect(log()).toEqual(['eval:needy', 'apply:needy', 'dispose:needy'])
    })
  })

  describe('reconcile', () => {
    it('restarts a plugin with new config when only the config changed', async () => {
      await install('hello')
      await configure({ hello: 'config: { n: 1 }' })
      await start()
      await configure({ hello: 'config: { n: 2 }' })
      touch('.diabase/config.yml')
      await until(() => globalThis.__loaderLog.length === 4)
      expect(globalThis.__loaderLog).toEqual([
        ['eval', 'hello'],
        ['apply', 'hello', { n: 1 }],
        ['dispose', 'hello'],
        ['apply', 'hello', { n: 2 }], // same module: no re-import for a config change
      ])
      expect(status('hello').state).toBe('active')
    })

    it('retries a failed plugin when its config changes', async () => {
      await install('flaky', 'flaky', {}, { body: "if (config?.fail) throw new Error('nope, fail=' + config.fail)" })
      await configure({ flaky: 'config: { fail: true }' })
      await start()
      expect(status('flaky')).toMatchObject({ state: 'failed', error: 'nope, fail=true' })
      await configure({ flaky: 'config: { fail: false }' })
      await root.loader.reload()
      expect(status('flaky')).toMatchObject({ state: 'active' })
      expect(status('flaky').error).toBeUndefined()
    })

    it('disposes a plugin when enabled becomes false and loads it again when re-enabled', async () => {
      await install('hello')
      await configure({ hello: null })
      await start()
      await configure({ hello: 'enabled: false' })
      touch('.diabase/config.yml')
      await until(() => log().includes('dispose:hello'))
      expect(log()).toEqual(['eval:hello', 'apply:hello', 'dispose:hello'])
      expect(status('hello')).toMatchObject({ state: 'disabled', enabled: false })

      await configure({ hello: null })
      touch('.diabase/config.yml')
      await until(() => log().length === 4)
      expect(status('hello').state).toBe('active')
      expect(log()).toEqual(['eval:hello', 'apply:hello', 'dispose:hello', 'apply:hello'])
    })

    it('loads the new code when the main file changes and disposes the old one first', async () => {
      await install('hello', 'v1')
      await configure({ hello: null })
      await start()
      await put(`${pluginDir('hello')}/index.mjs`, fixture('v2'))
      touch(`${pluginDir('hello')}/index.mjs`)
      await until(() => log().includes('apply:v2'))
      expect(log()).toEqual(['eval:v1', 'apply:v1', 'dispose:v1', 'eval:v2', 'apply:v2'])
      expect(status('hello').state).toBe('active')
    })

    it('reloads when the manifest changes', async () => {
      await install('hello', 'v1')
      await configure({ hello: null })
      await start()
      await put(`${pluginDir('hello')}/diabase.plugin.json`, manifest('hello', { description: 'changed' }))
      touch(`${pluginDir('hello')}/diabase.plugin.json`)
      await until(() => status('hello').manifest?.description === 'changed' && status('hello').state === 'active')
      expect(log()).toEqual(['eval:v1', 'apply:v1', 'dispose:v1', 'eval:v1', 'apply:v1'])
    })

    it('disposes a plugin whose directory is deleted', async () => {
      await install('hello')
      await install('keep')
      await configure({ hello: null, keep: null })
      await start()
      await fs.rm(path.join(vaultDir, pluginDir('hello')), { recursive: true })
      root.emit('vault/changed', [{ type: 'unlink', path: pluginDir('hello'), kind: 'dir', origin: 'external' }])
      await until(() => log().includes('dispose:hello'))
      expect(root.loader.list().map((s) => s.id)).toEqual(['keep'])
      expect(log()).not.toContain('dispose:keep')
    })

    it('picks up a plugin installed after startup', async () => {
      await configure({ late: null })
      await start()
      expect(root.loader.list()).toEqual([])
      await install('late')
      root.emit('vault/changed', [{ type: 'add', path: pluginDir('late'), kind: 'dir', origin: 'external' }])
      await until(() => root.loader.list().some((s) => s.id === 'late' && s.state === 'active'))
    })

    it('keeps loaded plugins and the last good config when config.yml is invalid', async () => {
      await install('hello')
      await configure({ hello: 'config: { n: 1 }' })
      await start()

      await put('.diabase/config.yml', 'plugins: { hello: [unclosed\n')
      await root.loader.reload()
      expect(root.loader.configError()).toMatch(/config\.yml/)
      expect(status('hello').state).toBe('active')

      await put('.diabase/config.yml', yamlConfig({ hello: 'enabled: "sometimes"' }))
      await root.loader.reload()
      expect(root.loader.configError()).toMatch(/plugins\.hello\.enabled/)
      expect(status('hello')).toMatchObject({ state: 'active', enabled: true })

      await put('.diabase/config.yml', '- just\n- a list\n')
      await root.loader.reload()
      expect(root.loader.configError()).toMatch(/invalid \.diabase\/config\.yml/)

      expect(log()).toEqual(['eval:hello', 'apply:hello'])

      await configure({ hello: 'config: { n: 2 }' })
      await root.loader.reload()
      expect(root.loader.configError()).toBeNull()
      expect(log()).toEqual(['eval:hello', 'apply:hello', 'dispose:hello', 'apply:hello'])
    })

    it('loads nothing when the very first config is invalid', async () => {
      await install('hello')
      await put('.diabase/config.yml', 'plugins: [')
      await start()
      expect(root.loader.configError()).toBeTruthy()
      expect(status('hello').state).toBe('disabled')
      expect(globalThis.__loaderLog).toEqual([])
    })

    it('reload(id) forces a fresh import, plain reload() does not', async () => {
      await install('hello')
      await install('other')
      await configure({ hello: null, other: null })
      await start()
      await root.loader.reload()
      expect(log()).toEqual(['eval:hello', 'apply:hello', 'eval:other', 'apply:other'])

      await root.loader.reload('hello')
      expect(log().slice(4)).toEqual(['dispose:hello', 'eval:hello', 'apply:hello'])
      await root.loader.reload('hello')
      expect(log().slice(7)).toEqual(['dispose:hello', 'eval:hello', 'apply:hello'])
      await root.loader.reload('nope')
      expect(log()).toHaveLength(10)
    })

    it('imports with a content-derived ?diabase-rev= that changes with the code', async () => {
      await install('hello', 'v1')
      await configure({ hello: null })
      const urls: string[] = []
      await start({ importer: (url) => (urls.push(url), import(/* @vite-ignore */ url)) })
      await put(`${pluginDir('hello')}/index.mjs`, fixture('v2'))
      await root.loader.reload()
      await root.loader.reload('hello')
      expect(urls).toHaveLength(3)
      for (const url of urls) {
        expect(url).toMatch(/^file:\/\/\/.*\/\.diabase\/plugins\/hello\/index\.mjs\?diabase-rev=[0-9a-f]{16}$/)
      }
      expect(new Set(urls).size).toBe(3)
    })

    it('emits loader/changed only when something changed', async () => {
      await install('hello')
      await configure({ hello: null })
      let changes = 0
      root.on('loader/changed', () => void changes++)
      await start()
      expect(changes).toBe(1)

      await root.loader.reload()
      expect(changes).toBe(1)

      await configure({ hello: 'config: { n: 1 }' })
      await root.loader.reload()
      expect(changes).toBe(2)

      await put('.diabase/config.yml', 'plugins: [')
      await root.loader.reload()
      expect(changes).toBe(3)
      await root.loader.reload()
      expect(changes).toBe(3)

      await root.loader.reload('hello')
      expect(changes).toBe(4)
    })
  })

  describe('triggers', () => {
    it('coalesces bursts of vault events into one reconcile', async () => {
      await install('hello')
      await configure({ hello: null })
      await start()
      const before = pluginListCalls()
      for (let i = 0; i < 5; i++) touch(`${pluginDir('hello')}/index.mjs`)
      touch('.diabase/config.yml', '.diabase', '.diabase/plugins')
      root.emit('vault/changed', [{ type: 'rename', from: 'x.md', to: `${pluginDir('hello')}/moved.mjs`, origin: 'external' }])
      await sleep(120)
      expect(pluginListCalls() - before).toBe(1)
    })

    it('coalesces overlapping reload() calls', async () => {
      await install('hello')
      await configure({ hello: null })
      await start()
      const before = pluginListCalls()
      await Promise.all([root.loader.reload(), root.loader.reload(), root.loader.reload()])
      expect(pluginListCalls() - before).toBe(1)
    })

    it('runs one follow-up reconcile for requests that arrive during a run', async () => {
      await install('slow')
      await put(`${pluginDir('slow')}/index.mjs`, fixture('slow').replace('apply(ctx, config) {', 'async apply(ctx, config) { await new Promise((r) => setTimeout(r, 50))'))
      await configure({ slow: null })
      const loading = root.plugin(PluginLoader, { root: vaultDir, debounce: 20 })
      fibers.push(await root.plugin(FsVault, { root: vaultDir }))
      await loading
      fibers.push(loading)
      const before = pluginListCalls()
      const first = root.loader.reload('slow')
      await sleep(10) // the run is now inside the slow apply
      const rest = [root.loader.reload(), root.loader.reload(), root.loader.reload()]
      await Promise.all([first, ...rest])
      // run 1 (forced) + exactly one follow-up shared by the three later calls
      expect(pluginListCalls() - before).toBe(2)
    })

    it('ignores events for unrelated paths', async () => {
      await install('hello')
      await configure({ hello: null })
      await start()
      const before = pluginListCalls()
      const reads = (root.vault as unknown as FsVault).calls.read!.length
      touch('notes/a.md', '.diabase/blocks/x/block.md', '.diabase/pluginsx/y', '.diabase/config.yml.bak', 'config.yml')
      root.emit('vault/changed', [{ type: 'rename', from: 'a.md', to: 'b.md', origin: 'self' }])
      await sleep(80)
      expect(pluginListCalls()).toBe(before)
      expect((root.vault as unknown as FsVault).calls.read!.length).toBe(reads)
    })
  })

  describe('lifecycle', () => {
    it('disposing the loader disposes its plugins and stops reacting to events', async () => {
      await install('a')
      await install('b')
      await configure({ a: null, b: null })
      const { loader } = await start()
      await loader.dispose()
      expect(log().filter((e) => e.startsWith('dispose')).sort()).toEqual(['dispose:a', 'dispose:b'])
      expect(root.get('loader')).toBeUndefined()

      const calls = pluginListCalls()
      const logged = globalThis.__loaderLog.length
      touch('.diabase/config.yml')
      await sleep(80)
      expect(pluginListCalls()).toBe(calls)
      expect(globalThis.__loaderLog).toHaveLength(logged)
    })

    it('does not run a pending debounced reconcile after dispose', async () => {
      await install('hello')
      await configure({ hello: null })
      const { loader } = await start({ debounce: 40 })
      const calls = pluginListCalls()
      touch('.diabase/config.yml')
      await loader.dispose()
      await sleep(100)
      expect(pluginListCalls()).toBe(calls)
    })

    it('disposes cleanly while a reconcile is still loading a slow plugin', async () => {
      await install('slow')
      await put(`${pluginDir('slow')}/index.mjs`, fixture('slow').replace('apply(ctx, config) {', 'async apply(ctx, config) { await new Promise((r) => setTimeout(r, 60))'))
      await configure({ slow: null })
      const vault = root.plugin(FsVault, { root: vaultDir })
      fibers.push(vault)
      const loader = root.plugin(PluginLoader, { root: vaultDir })
      fibers.push(loader)
      await sleep(20)
      await loader.dispose()
      await sleep(80)
      expect(log().filter((e) => e.startsWith('dispose'))).toEqual(['dispose:slow'])
      expect(root.get('loader')).toBeUndefined()
    })

    it('disposes the loader and its plugins when the vault service leaves, and re-applies them when it returns', async () => {
      await install('hello')
      await configure({ hello: null })
      const { vault } = await start()
      await vault.dispose()
      await until(() => log().includes('dispose:hello'))
      expect(root.get('loader')).toBeUndefined()
      const calls = globalThis.__loaderLog.length
      touch('.diabase/config.yml')
      await sleep(60)
      expect(globalThis.__loaderLog).toHaveLength(calls)

      fibers.push(root.plugin(FsVault, { root: vaultDir }))
      await until(() => root.get('loader') !== undefined && root.loader.list().some((s) => s.state === 'active'))
      expect(log()).toEqual(['eval:hello', 'apply:hello', 'dispose:hello', 'apply:hello'])
    })

    it('rejects a relative root', async () => {
      const vault = root.plugin(FsVault, { root: vaultDir })
      fibers.push(vault)
      await vault
      const loader = root.plugin(PluginLoader, { root: 'vault' })
      await expect(loader).rejects.toThrow(/absolute path/)
    })
  })
})
