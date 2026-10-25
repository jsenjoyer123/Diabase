import { afterEach, describe, expect, it, vi } from 'vitest'
import { SHARED_MODULES } from '@diabase/protocol'
import { Builder } from '../src/builder.ts'
import { BundlerConfigSchema } from '../src/index.ts'
import { decodeSourceMap } from '../src/sourcemap.ts'
import {
  boot,
  expectOk,
  fakeHost,
  makeRequire,
  runFactory,
  SHELF_DIR,
  SHELF_FILES,
  shelfVault,
  type Element,
  type Harness,
} from './helpers.ts'

let h: Harness | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  await h?.dispose()
  h = undefined
})

const HASH = /^sha256-[0-9a-f]{64}$/
const MAP_PREFIX = '//# sourceMappingURL=data:application/json;base64,'

function inlineMap(code: string): { sourceRoot: string; sources: string[]; sourcesContent: string[]; mappings: string } {
  const line = code.split('\n').find((l) => l.startsWith(MAP_PREFIX))
  expect(line).toBeDefined()
  return JSON.parse(Buffer.from(line!.slice(MAP_PREFIX.length), 'base64').toString('utf8'))
}

function cssMap(css: string): { sourceRoot: string; sources: string[] } {
  const match = /\/\*# sourceMappingURL=data:application\/json;base64,([^ ]+) \*\/\n$/.exec(css)
  expect(match).not.toBeNull()
  return JSON.parse(Buffer.from(match![1]!, 'base64').toString('utf8'))
}

/** Evaluates the sample block against the fake host and renders its component once. */
function mountShelf(code: string, props: Record<string, unknown> = {}) {
  const host = fakeHost()
  const { reg, exports } = runFactory(code, host.require)
  const plugin = exports.default as { name: string; apply(ctx: { blocks: unknown[] }): void }
  const ctx = { blocks: [] as Array<{ type: string; render: (props: Record<string, unknown>) => Element }> }
  plugin.apply(ctx)
  return { host, reg, exports, plugin, ctx, tree: ctx.blocks[0]!.render(props) }
}

describe('config', () => {
  it('applies the README §8 defaults, also when no config is given', () => {
    const expected = {
      timeout: 15_000,
      cacheSize: 64,
      maxFiles: 256,
      maxFileBytes: 1024 * 1024,
      maxInputBytes: 4 * 1024 * 1024,
      maxBundleBytes: 1024 * 1024,
      maxCssBytes: 512 * 1024,
      sourcemap: true,
      allowDynamicCode: false,
    }
    expect(BundlerConfigSchema.parse({})).toEqual(expected)
    expect(BundlerConfigSchema.parse(undefined)).toEqual(expected)
    expect(BundlerConfigSchema.parse({ timeout: 5 })).toEqual({ ...expected, timeout: 5 })
    expect(BundlerConfigSchema.safeParse({ timeout: -1 }).success).toBe(false)
  })

  it('returns a fresh mutable copy of SHARED_MODULES', async () => {
    h = await boot()
    const first = h.bundler.sharedModules()
    expect(first).toEqual([...SHARED_MODULES])
    first.push('lodash')
    expect(h.bundler.sharedModules()).toEqual([...SHARED_MODULES])
  })
})

describe('dir build of a TSX block', () => {
  it('produces the README §5 wrapper, css, and an inline sourcemap', async () => {
    h = await boot(shelfVault())
    const result = expectOk(await h.build({ dir: SHELF_DIR }))

    expect(result.hash).toMatch(HASH)
    expect(result.warnings).toEqual([])

    const lines = result.code.split('\n')
    expect(lines[0]).toBe(
      `__diabase_modules__.load({ id: ${JSON.stringify(SHELF_DIR)}, hash: ${JSON.stringify(result.hash)}, factory: function (require, module, exports) {`,
    )
    expect(lines[1]).toBe('"use strict";')
    // Shared modules stay external; relative modules, json and css modules are bundled.
    expect(result.code).toContain('require("react")')
    expect(result.code).toContain('require("react/jsx-runtime")')
    expect(result.code).toContain('require("@diabase/sdk")')
    expect(result.code).not.toContain('@diabase/kernel')
    expect(result.code).not.toContain('import(')

    const tail = lines.slice(-4)
    expect(tail[0]).toBe('} });')
    expect(tail[1]).toBe(`//# sourceURL=diabase://bundles/${result.hash}.js`)
    expect(tail[2]).toMatch(/^\/\/# sourceMappingURL=data:application\/json;base64,[A-Za-z0-9+/=]+$/)
    expect(tail[3]).toBe('')
    expect(result.code.match(/^\/\/# sourceURL=/gm)).toHaveLength(1)

    // css: global rules and module rules with salted class names, headers show vault paths.
    expect(result.css).toBeDefined()
    expect(result.css).toContain('.shelf-root {\n  display: grid;\n}')
    expect(result.css).toMatch(/\.shelf_[0-9a-f]{8}_shelf \{\n {2}color: tomato;\n\}/)
    expect(result.css).toMatch(/\.shelf_[0-9a-f]{8}_shelf:hover \.shelf_[0-9a-f]{8}_count \{/)
    expect(result.css).toContain(`/* ${SHELF_DIR}/shelf.css */`)
    expect(result.css).toContain(`/* ${SHELF_DIR}/shelf.module.css */`)
    const css = cssMap(result.css!)
    expect(css.sourceRoot).toBe('diabase://vault/')
    expect(css.sources.sort()).toEqual([`${SHELF_DIR}/shelf.css`, `${SHELF_DIR}/shelf.module.css`])

    // sourcemap: Diagnostic.file strings as sources, the virtual entry dropped.
    const map = inlineMap(result.code)
    expect(map.sourceRoot).toBe('diabase://vault/')
    expect(map.sources).toEqual(
      ['index.tsx', 'lib/greet.ts', 'data.json', 'shelf.module.css'].map((p) => `${SHELF_DIR}/${p}`),
    )
    expect(map.sourcesContent).toEqual([
      SHELF_FILES['index.tsx'],
      SHELF_FILES['lib/greet.ts'],
      SHELF_FILES['data.json'],
      SHELF_FILES['shelf.module.css'],
    ])

    // No namespaces, virtual names or host paths leak into any output.
    for (const text of [result.code, result.css!, JSON.stringify(map)]) {
      expect(text).not.toContain('diabase-vfs')
      expect(text).not.toContain('//entry.js')
      expect(text).not.toContain(process.cwd())
    }
    expect(result.code).toContain('// (bundle entry)')
    expect(result.code).toContain(`// ${SHELF_DIR}/lib/greet.ts`)
  })

  it('maps generated positions back to the original source lines', async () => {
    h = await boot(shelfVault())
    const result = expectOk(await h.build({ dir: SHELF_DIR }))
    const map = inlineMap(result.code)
    const mappings = decodeSourceMap(JSON.stringify(map))

    const generated = result.code.split('\n')
    const original = SHELF_FILES['index.tsx']!.split('\n')
    const generatedLine = generated.findIndex((l) => l.includes('greet(props.title'))
    const originalLine = original.findIndex((l) => l.includes('greet(props.title'))
    expect(generatedLine).toBeGreaterThan(1)
    expect(originalLine).toBeGreaterThan(0)

    const here = mappings.filter(([line]) => line === generatedLine)
    expect(here.length).toBeGreaterThan(0)
    // index.tsx is source 0, and the banner lines are accounted for.
    expect(here.some(([, , source, line]) => source === 0 && line === originalLine)).toBe(true)

    const greetLine = generated.findIndex((l) => l.includes('var greet = '))
    expect(mappings.some(([line, , source]) => line === greetLine && map.sources[source!]!.endsWith('lib/greet.ts'))).toBe(true)
  })

  it('evaluates to a registration whose factory yields the Cordis plugin (README §5/§6)', async () => {
    h = await boot(shelfVault())
    const result = expectOk(await h.build({ dir: SHELF_DIR }))
    const { host, reg, plugin, ctx, tree } = mountShelf(result.code, {})

    expect(Object.keys(reg).sort()).toEqual(['factory', 'hash', 'id'])
    expect(reg.id).toBe(SHELF_DIR)
    expect(reg.hash).toBe(result.hash)
    expect(typeof reg.factory).toBe('function')

    expect(plugin.name).toBe('user/shelf')
    expect(typeof plugin.apply).toBe('function')
    expect(ctx.blocks).toHaveLength(1)
    expect(ctx.blocks[0]!.type).toBe('user/shelf')

    // Rendering exercises the bundled relative module, the JSON and the CSS-module class map.
    expect(host.stateCalls).toEqual([3])
    expect(tree.type).toBe('section')
    expect(tree.props.className).toMatch(/^shelf_[0-9a-f]{8}_shelf$/)
    const children = tree.props.children as Element[]
    expect(children).toHaveLength(2)
    expect(children[0]).toMatchObject({ type: 'h2', props: { children: 'Hello, Shelf!' } })
    expect(children[1]).toMatchObject({ type: 'span', props: { className: 'count', children: 3 } })
    // The class name used by the component is the one in the css.
    expect(result.css).toContain(`.${tree.props.className as string} {`)

    // Props flow through the bundled function.
    expect(mountShelf(result.code, { title: 'Dune' }).tree.props.children).toMatchObject([
      { props: { children: 'Hello, Dune!' } },
      {},
    ])
  })

  it('fails the factory (not the registration) when the host lacks a shared module', async () => {
    h = await boot(shelfVault())
    const result = expectOk(await h.build({ dir: SHELF_DIR }))
    const { react: _omitted, ...withoutReact } = fakeHost().table
    expect(() => runFactory(result.code, makeRequire(withoutReact))).toThrow("Module 'react' is not provided to blocks")
  })

  it('omits css when no stylesheet is imported, and the inline maps when sourcemap is off', async () => {
    h = await boot({ [`${SHELF_DIR}/index.tsx`]: 'export default { name: "plain", apply() {} }' }, { sourcemap: false })
    const result = expectOk(await h.build({ dir: SHELF_DIR }))
    expect(result.css).toBeUndefined()
    expect('css' in result).toBe(false)
    expect(result.code).toContain('//# sourceURL=diabase://bundles/')
    expect(result.code).not.toContain('sourceMappingURL')
    expect(runFactory(result.code, fakeHost().require).exports.default).toMatchObject({ name: 'plain' })
  })

  it('leaves no sourcemap comment in css when sourcemap is off', async () => {
    h = await boot(shelfVault(), { sourcemap: false })
    const result = expectOk(await h.build({ dir: SHELF_DIR }))
    expect(result.css).toContain('.shelf-root')
    expect(result.css).not.toContain('sourceMappingURL')
  })

  it('accepts an explicit entry and treats entry-relative imports from there', async () => {
    h = await boot({
      'blocks/a/main.ts': 'import { n } from "./util.ts"\nexport default { name: "a", apply() { return n } }',
      'blocks/a/util.ts': 'export const n = 7',
    })
    const result = expectOk(await h.build({ dir: 'blocks/a/', entry: './main.ts' }))
    const { exports, reg } = runFactory(result.code, fakeHost().require)
    expect(reg.id).toBe('blocks/a')
    expect((exports.default as { apply(): number }).apply()).toBe(7)
  })
})

describe('draft build', () => {
  it('builds { files, entry } like a dir build, with draft keys as files', async () => {
    h = await boot()
    const result = expectOk(await h.build({ files: SHELF_FILES, entry: 'index.tsx' }))
    expect(result.warnings).toEqual([])
    expect(result.hash).toMatch(HASH)
    expect(result.code.split('\n')[0]).toContain('id: "draft:index.tsx"')

    const map = inlineMap(result.code)
    expect(map.sourceRoot).toBe('diabase://draft/')
    expect(map.sources).toEqual(['index.tsx', 'lib/greet.ts', 'data.json', 'shelf.module.css'])
    expect(result.css).toContain('/* shelf.module.css */')
    expect(cssMap(result.css!).sources.sort()).toEqual(['shelf.css', 'shelf.module.css'])

    const { reg, plugin, tree } = mountShelf(result.code)
    expect(reg.id).toBe('draft:index.tsx')
    expect(reg.hash).toBe(result.hash)
    expect(plugin.name).toBe('user/shelf')
    expect(tree.props.className).toMatch(/^shelf_[0-9a-f]{8}_shelf$/)
    // Drafts never touch the vault.
    expect(h.vault.calls).toEqual([])
  })

  it('reports draft diagnostics against the draft keys', async () => {
    h = await boot()
    const result = await h.build({
      files: { 'index.tsx': 'import x from "./ui/panel.ts"\nexport default x', 'ui/panel.ts': 'import fs from "fs"\nexport default fs' },
      entry: 'index.tsx',
    })
    expect(result).toMatchObject({ ok: false, errors: [{ file: 'ui/panel.ts', line: 1, column: 16 }] })
  })
})

describe('assets and extra import forms', () => {
  it('inlines images as data URLs, text files as strings, and bundles dynamic relative imports', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    h = await boot({
      'b/index.tsx': `import icon from './icon.png'
import logo from './logo.svg'
import notes from './notes.md'
import raw from './raw.txt'
export default { name: 'assets', apply() {}, assets: { icon, logo, notes, raw }, lazy: () => import('./lazy.ts') }`,
      'b/icon.png': png,
      'b/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
      'b/notes.md': '# Title\n\nbody\n',
      'b/raw.txt': 'plain text',
      'b/lazy.ts': 'export const lazy = 42',
    })
    const result = expectOk(await h.build({ dir: 'b' }))
    expect(result.code).not.toMatch(/\bimport\(/)
    const plugin = runFactory(result.code, fakeHost().require).exports.default as {
      assets: Record<string, string>
      lazy(): Promise<{ lazy: number }>
    }
    expect(plugin.assets.icon).toBe(`data:image/png;base64,${Buffer.from(png).toString('base64')}`)
    expect(plugin.assets.logo).toMatch(/^data:image\/svg\+xml,/)
    expect(plugin.assets.notes).toBe('# Title\n\nbody\n')
    expect(plugin.assets.raw).toBe('plain text')
    expect((await plugin.lazy()).lazy).toBe(42)
  })

  it('supports css imports, composes and data:/# urls, and a .js entry with JSX', async () => {
    h = await boot()
    const result = expectOk(
      await h.build({
        files: {
          'index.js': `import s from './a.module.css'
import './base.css'
export default { name: 'css', apply() {}, tree: <b className={s.a} /> }`,
          'a.module.css': `.a { composes: b from './b.module.css'; color: red; background: url(data:image/png;base64,AAAA); mask: url(#m) }`,
          'b.module.css': '.b { color: blue }',
          'base.css': `@import "./reset.css";\n.base { background: url(./dot.png) }`,
          'reset.css': '* { margin: 0 }',
          'dot.png': 'PNG',
        },
        entry: 'index.js',
      }),
    )
    expect(result.css).toContain('url(data:image/png;base64,AAAA)')
    expect(result.css).toContain('url(#m)')
    expect(result.css).toContain('url(data:image/png,PNG)')
    expect(result.css!.indexOf('* {')).toBeLessThan(result.css!.indexOf('.base'))
    const plugin = runFactory(result.code, fakeHost().require).exports.default as { tree: Element }
    const [own, composed] = (plugin.tree.props.className as string).split(' ')
    expect(own).toMatch(/^b_[0-9a-f]{8}_b$/)
    expect(composed).toMatch(/^a_[0-9a-f]{8}_a$/)
  })
})

describe('validation hook', () => {
  it('calls runValidation once with the wrapper output, map and options, before the trailers are added', async () => {
    const spy = vi.spyOn(Builder.prototype as unknown as { runValidation(): unknown }, 'runValidation')
    h = await boot(shelfVault(), { maxBundleBytes: 123_456, maxCssBytes: 654_321, allowDynamicCode: true })
    const result = expectOk(await h.build({ dir: SHELF_DIR }))
    expect(spy).toHaveBeenCalledTimes(1)
    const [input, options] = spy.mock.calls[0] as unknown as [
      { code: string; css?: string; map?: string },
      Record<string, unknown>,
    ]
    expect(input.code.split('\n')[0]).toContain('__diabase_modules__.load(')
    expect(input.code).not.toContain('sourceURL')
    expect(input.code).not.toContain('sourceMappingURL')
    expect(result.code.startsWith(input.code)).toBe(true)
    expect(input.css).toContain('.shelf-root')
    expect(input.css).not.toContain('sourceMappingURL')
    const map = JSON.parse(input.map!)
    expect(map.sources[0]).toBe(`${SHELF_DIR}/index.tsx`)
    expect(map.sourceRoot).toBe('diabase://vault/')
    expect(options).toEqual({
      maxBundleBytes: 123_456,
      maxCssBytes: 654_321,
      allowDynamicCode: true,
      sharedModules: [...SHARED_MODULES],
      expect: { id: SHELF_DIR, hash: result.hash },
    })
  })

  it('turns validation errors into a failed result and keeps all warnings', async () => {
    const spy = vi.spyOn(Builder.prototype as unknown as { runValidation(): unknown }, 'runValidation')
    spy.mockReturnValue({
      errors: [{ text: 'nope', file: 'index.tsx', line: 1, column: 2 }],
      warnings: [{ text: 'validator warning' }],
    })
    h = await boot()
    const result = await h.build({
      files: { 'index.tsx': 'export default { apply() { return import.meta.url } }' },
      entry: 'index.tsx',
    })
    expect(result).toMatchObject({
      ok: false,
      errors: [{ text: 'nope', file: 'index.tsx', line: 1, column: 2 }],
      warnings: [{ text: expect.stringContaining('import.meta') }, { text: 'validator warning' }],
    })
  })
})
