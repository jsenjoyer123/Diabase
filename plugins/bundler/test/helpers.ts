import { readdirSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect } from 'vitest'
import { Context } from '@diabase/kernel'
import type { BuildInput, BuildResult, BundleRegistration, BundlerService, Diagnostic } from '@diabase/protocol'
import { Bundler, type BundlerConfigInput } from '../src/index.ts'
import { FakeVault, type FakeVaultState } from './fake-vault.ts'

export type Files = Record<string, string | Uint8Array>

export interface Harness {
  root: Context
  /** The mutable fake vault contents and knobs. */
  vault: FakeVaultState
  /** `root.bundler`, as consumers see it. */
  bundler: BundlerService
  /** The same service with its test-only counters. */
  instance: Bundler
  /** `bundler.build` plus the structured-clone check on the result. */
  build(input: BuildInput): Promise<BuildResult>
  dispose(): Promise<void>
}

/** Boots `FakeVault` + `Bundler` on a fresh Cordis root context. */
export async function boot(
  files: Files = {},
  config?: BundlerConfigInput,
  vault: Partial<FakeVaultState> = {},
): Promise<Harness> {
  const root = new Context()
  const state: FakeVaultState = { ...vault, files }
  const vaultFiber = root.plugin(FakeVault, state)
  await vaultFiber
  const fiber = root.plugin(Bundler, config)
  await fiber
  const bundler = root.bundler
  return {
    root,
    vault: state,
    bundler,
    instance: bundler as unknown as Bundler,
    async build(input) {
      return expectCloneable(await bundler.build(input))
    },
    async dispose() {
      await fiber.dispose()
      await vaultFiber.dispose()
    },
  }
}

/** Every BuildResult crosses the IPC bridge: it must survive a structured clone unchanged. */
export function expectCloneable(result: BuildResult): BuildResult {
  expect(structuredClone(result)).toEqual(result)
  return result
}

export function expectOk(result: BuildResult): Extract<BuildResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected a successful build, got:\n${formatDiagnostics(result.errors)}`)
  return result
}

export function expectFail(result: BuildResult): Extract<BuildResult, { ok: false }> {
  if (result.ok) throw new Error('expected a failed build, got success')
  return result
}

export function formatDiagnostics(list: Diagnostic[]): string {
  return list
    .map((d) => `${d.file ?? '?'}:${d.line ?? '?'}:${d.column ?? '?'} ${d.text}`)
    .join('\n')
}

// --- evaluating a bundle like the renderer host does -------------------------------------------

export type Interop = Readonly<Record<string, unknown>> & { __esModule: true }

/** README §6.4: `{ __esModule: true, ...namespace, default: namespace.default ?? namespace }`. */
export function interop(namespace: Record<string, unknown>): Interop {
  return Object.freeze({ __esModule: true as const, ...namespace, default: namespace.default ?? namespace })
}

export function makeRequire(table: Record<string, unknown>): (specifier: string) => unknown {
  return (specifier) => {
    if (!Object.hasOwn(table, specifier)) throw new Error(`Module '${specifier}' is not provided to blocks`)
    return table[specifier]
  }
}

/** Evaluates `code` in a fresh realm whose `__diabase_modules__.load` captures the registration. */
export function evaluate(code: string): BundleRegistration[] {
  const registrations: BundleRegistration[] = []
  runInNewContext(
    code,
    { __diabase_modules__: Object.freeze({ load: (reg: BundleRegistration) => void registrations.push(reg) }) },
    { filename: 'bundle.js' },
  )
  return registrations
}

export interface Element {
  type: unknown
  props: Record<string, unknown>
  key?: unknown
}

/** Fake host modules for the sample block: enough React / SDK to run and render it. */
export function fakeHost() {
  const jsx = (type: unknown, props: Record<string, unknown>, key?: unknown): Element => ({ type, props, key })
  const stateCalls: unknown[] = []
  const blocks: Array<{ type: string; render: (props: Record<string, unknown>) => Element }> = []
  const table = {
    react: interop({ useState: (initial: unknown) => (stateCalls.push(initial), [initial, () => {}]) }),
    'react/jsx-runtime': interop({ jsx, jsxs: jsx, Fragment: Symbol.for('fragment') }),
    '@diabase/sdk': interop({
      registerBlock: (ctx: { blocks: unknown[] }, def: unknown) => void ctx.blocks.push(def),
    }),
  }
  return { table, stateCalls, blocks, require: makeRequire(table) }
}

/** Runs the bundle's factory with the fake host and returns `module.exports`. */
export function runFactory(code: string, require: (specifier: string) => unknown) {
  const [reg, ...rest] = evaluate(code)
  expect(rest).toEqual([])
  expect(reg).toBeDefined()
  const module = { exports: {} as Record<string, unknown> }
  reg!.factory(require, module, module.exports)
  return { reg: reg!, exports: module.exports }
}

// --- the sample block ------------------------------------------------------------------------

export const SHELF_DIR = '.diabase/blocks/user/shelf'

export const SHELF_FILES: Record<string, string> = {
  'index.tsx': `import { useState } from 'react'
import { registerBlock } from '@diabase/sdk'
import type { Context } from '@diabase/kernel'
import { greet } from './lib/greet.ts'
import data from './data.json'
import styles from './shelf.module.css'
import './shelf.css'

function Shelf(props: { title?: string }) {
  const [count] = useState(data.count)
  return (
    <section className={styles.shelf}>
      <h2>{greet(props.title ?? data.title)}</h2>
      <span className="count">{count}</span>
    </section>
  )
}

export default {
  name: 'user/shelf',
  apply(ctx: Context) {
    registerBlock(ctx, { type: 'user/shelf', render: Shelf })
  },
}
`,
  'lib/greet.ts': 'export const greet = (name: string): string => `Hello, ${name}!`\n',
  'data.json': '{ "title": "Shelf", "count": 3 }\n',
  'shelf.css': '.shelf-root { display: grid; }\n',
  'shelf.module.css': '.shelf { color: tomato; }\n.shelf:hover .count { opacity: 0.5; }\n',
}

export function inDir(dir: string, files: Record<string, string | Uint8Array>): Files {
  return Object.fromEntries(Object.entries(files).map(([path, content]) => [`${dir}/${path}`, content]))
}

/** A vault holding only the sample block at `dir`. */
export function shelfVault(dir = SHELF_DIR): Files {
  return inDir(dir, SHELF_FILES)
}

// --- process hygiene (Linux) -------------------------------------------------------------------

/** Pids of direct children of this process whose command line mentions esbuild (Linux `/proc`). */
export function esbuildChildren(): number[] {
  const found: number[] = []
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      // "pid (comm) state ppid ..." where comm may contain spaces and parentheses.
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
      if (ppid !== process.pid) continue
      const cmdline = readFileSync(`/proc/${name}/cmdline`, 'utf8')
      if (cmdline.includes('esbuild')) found.push(Number(name))
    } catch {
      // the process exited while scanning
    }
  }
  return found
}

/** Polls `check` until it returns a truthy value or `timeoutMs` passes. */
export async function waitFor<T>(check: () => T, timeoutMs = 3000, intervalMs = 20): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = check()
    if (value || Date.now() >= deadline) return value
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
