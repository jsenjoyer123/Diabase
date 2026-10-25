// Block contract. A block type is described by a serializable `BlockManifest`
// (what the GenUI agent sees and what gets persisted to the vault) and, for
// code-backed blocks, a renderer-local `BlockDefinition` holding the component.
//
// Four origins, cheapest first — the agent should prefer them in this order:
//   composite: a layout subtree of existing blocks (no code)
//   derived:   a subset/preset of another block (parts filter + default props)
//   builtin:   shipped by an installed plugin
//   source:    authored TSX in the vault, compiled by the bundler and hot-mounted
import type { ComponentType } from 'react'
import { z } from 'zod'
import { BlockBinding, BlockInstance, BlockType, LayoutNode, PartSelector } from './layout.ts'
import type { VaultPath } from './vault.ts'

export const BlockPart = z.object({
  description: z.string(),
  /** Rendered when no PartSelector mentions it. */
  default: z.boolean().default(true),
})

export const BlockDataContract = z.object({
  note: z.enum(['none', 'optional', 'required']).default('none').describe('Does the block bind to a single note?'),
  query: z.enum(['none', 'optional', 'required']).default('none').describe('Does the block bind to a note query?'),
  writes: z.array(z.string()).default([]).describe('Frontmatter keys the block may write (e.g. ["rating"]).'),
})

export const BlockOrigin = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), plugin: z.string() }),
  z.object({
    kind: z.literal('derived'),
    extends: BlockType,
    defaults: z.record(z.string(), z.unknown()).default({}),
    parts: PartSelector.optional(),
    bind: BlockBinding.optional(),
    /** Props the derived block fixes; instances cannot override them. */
    lockedProps: z.array(z.string()).default([]),
  }),
  z.object({ kind: z.literal('composite'), layout: LayoutNode }),
  z.object({
    kind: z.literal('source'),
    /** Directory holding `block.md` and the entry file. */
    dir: z.string(),
    entry: z.string().default('index.tsx'),
  }),
])
export type BlockOrigin = z.infer<typeof BlockOrigin>

export const BlockManifest = z.object({
  type: BlockType,
  title: z.string(),
  description: z.string().describe('What the block shows and when to use it; written for the GenUI agent.'),
  version: z.string().default('0.1.0'),
  /** JSON Schema (draft 2020-12) of `props`. Code blocks derive it from their zod schema. */
  props: z.record(z.string(), z.unknown()).default({ type: 'object', properties: {} }),
  parts: z.record(z.string(), BlockPart).default({}),
  data: BlockDataContract.default({ note: 'none', query: 'none', writes: [] }),
  regions: z.array(z.enum(['main', 'sidebar', 'panel', 'overlay'])).default(['main']),
  origin: BlockOrigin,
})
export type BlockManifest = z.infer<typeof BlockManifest>

/** Props every block component receives. The Cordis context is reached via `useCtx()` from the blocks SDK. */
export interface BlockProps<P = Record<string, unknown>> {
  instance: BlockInstance
  props: P
  /** True if the named part should render under the instance's PartSelector. */
  has(part: string): boolean
  /** Persist new props for this instance into the workspace (merge). */
  setProps(patch: Partial<P>): void
}

/** Renderer-local definition of a code-backed block (origins `builtin` and `source`). */
export interface BlockDefinition<P = Record<string, unknown>> {
  manifest: Omit<z.input<typeof BlockManifest>, 'props' | 'origin'> & { origin?: BlockOrigin }
  /** Zod schema for props; the registry derives `manifest.props` JSON Schema from it. */
  schema?: z.ZodType<P>
  component: ComponentType<BlockProps<P>>
}

export interface SubsetSpec {
  type: string
  title: string
  description: string
  base: string
  defaults?: Record<string, unknown>
  parts?: PartSelector
  bind?: z.infer<typeof BlockBinding>
  lockedProps?: string[]
}

export interface ComposeSpec {
  type: string
  title: string
  description: string
  layout: LayoutNode
}

/** Renderer-local service (`ctx.blocks`); data methods are bridged to main as async. */
export interface BlockRegistryService {
  /** Register a code-backed block. Auto-unregistered when the calling plugin is disposed. */
  define<P>(definition: BlockDefinition<P>): () => void
  /** Register a data-only (derived / composite / source) manifest. */
  register(manifest: BlockManifest): () => void
  get(type: string): BlockManifest | undefined
  list(): BlockManifest[]
  subset(spec: SubsetSpec): BlockManifest
  compose(spec: ComposeSpec): BlockManifest
  /** Write the manifest to `.diabase/blocks/<ns>/<name>/block.md`. */
  persist(type: string): Promise<VaultPath>
}
