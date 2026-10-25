// Workspace layout ("runtimeSlots") contract. A workspace is pure data: a tree
// of container nodes whose leaves are slots hosting at most one block instance.
// It is persisted in the vault as a Markdown file (frontmatter `layout:`), and
// the GenUI agent edits it by emitting `LayoutOp[]`.
import { z } from 'zod'
import { NoteQuery } from './query.ts'
import type { VaultPath } from './vault.ts'

/** Unique within a workspace; stable across saves so ops and persisted props can target it. */
export const NodeId = z.string().regex(/^[A-Za-z0-9][\w.-]{0,63}$/)

/** Namespaced block type: `core/editor`, `files/tree`, `user/book-shelf`. */
export const BlockType = z.string().regex(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/)

export const PartSelector = z
  .object({
    include: z.array(z.string()).optional().describe('Only render these named parts.'),
    exclude: z.array(z.string()).optional().describe('Render all default parts except these.'),
  })
  .describe('Subsets a block to some of its named sub-components (see BlockManifest.parts).')
export type PartSelector = z.infer<typeof PartSelector>

export const BlockBinding = z
  .object({
    note: z.string().optional().describe('Vault path of the note this block reads/writes.'),
    query: NoteQuery.optional().describe('Set of notes this block renders.'),
  })
  .describe('What Markdown data the block instance is bound to.')
export type BlockBinding = z.infer<typeof BlockBinding>

export const BlockInstance = z.object({
  id: NodeId,
  type: BlockType,
  title: z.string().optional(),
  props: z.record(z.string(), z.unknown()).default({}),
  parts: PartSelector.optional(),
  bind: BlockBinding.optional(),
})
export type BlockInstance = z.infer<typeof BlockInstance>

/** Placement inside a parent `grid` (12-column units); ignored elsewhere. */
export const GridArea = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1),
})

const nodeBase = {
  id: NodeId,
  title: z.string().optional(),
  area: GridArea.optional(),
}

export type LayoutNode =
  | { kind: 'split'; id: string; title?: string; area?: z.infer<typeof GridArea>; direction: 'row' | 'column'; sizes?: number[]; children: LayoutNode[] }
  | { kind: 'grid'; id: string; title?: string; area?: z.infer<typeof GridArea>; columns?: number; rowHeight?: number; gap?: number; children: LayoutNode[] }
  | { kind: 'tabs'; id: string; title?: string; area?: z.infer<typeof GridArea>; active?: string; children: LayoutNode[] }
  | { kind: 'stack'; id: string; title?: string; area?: z.infer<typeof GridArea>; direction?: 'row' | 'column'; gap?: number; children: LayoutNode[] }
  | { kind: 'slot'; id: string; title?: string; area?: z.infer<typeof GridArea>; name?: string; block?: BlockInstance }

export const LayoutNode: z.ZodType<LayoutNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      ...nodeBase,
      kind: z.literal('split'),
      direction: z.enum(['row', 'column']),
      sizes: z.array(z.number().positive()).optional().describe('Relative sizes, one per child.'),
      children: z.array(LayoutNode).min(1),
    }),
    z.object({
      ...nodeBase,
      kind: z.literal('grid'),
      columns: z.number().int().min(1).max(12).optional(),
      rowHeight: z.number().positive().optional().describe('Pixels per grid row unit.'),
      gap: z.number().nonnegative().optional(),
      children: z.array(LayoutNode),
    }),
    z.object({ ...nodeBase, kind: z.literal('tabs'), active: z.string().optional(), children: z.array(LayoutNode).min(1) }),
    z.object({
      ...nodeBase,
      kind: z.literal('stack'),
      direction: z.enum(['row', 'column']).optional(),
      gap: z.number().nonnegative().optional(),
      children: z.array(LayoutNode),
    }),
    z.object({
      ...nodeBase,
      kind: z.literal('slot'),
      name: z.string().optional().describe('Named outlet: renders code-registered contributions when no block is mounted.'),
      block: BlockInstance.optional(),
    }),
  ]),
)

export const Region = z.object({
  open: z.boolean().default(true),
  /** Pixels (sidebars: width, bottom panel: height). */
  size: z.number().positive().optional(),
  node: LayoutNode,
})
export type Region = z.infer<typeof Region>

export const Overlay = z.object({
  id: NodeId,
  presentation: z.enum(['modal', 'drawer', 'popover', 'palette']),
  open: z.boolean().default(false),
  node: LayoutNode,
})
export type Overlay = z.infer<typeof Overlay>

export const Workspace = z.object({
  version: z.literal(1),
  id: NodeId,
  title: z.string(),
  description: z.string().optional(),
  main: LayoutNode,
  left: Region.optional(),
  right: Region.optional(),
  bottom: Region.optional(),
  overlays: z.array(Overlay).default([]),
})
export type Workspace = z.infer<typeof Workspace>

export type RegionName = 'main' | 'left' | 'right' | 'bottom'

const NodePatch = z
  .object({
    title: z.string(),
    direction: z.enum(['row', 'column']),
    sizes: z.array(z.number().positive()),
    columns: z.number().int().min(1).max(12),
    rowHeight: z.number().positive(),
    gap: z.number().nonnegative(),
    active: z.string(),
    name: z.string(),
    area: GridArea,
  })
  .partial()

/** Transactional edit language for workspaces. Targets are node ids, region names, or overlay ids. */
export const LayoutOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('mount'), slot: NodeId, block: BlockInstance }),
  z.object({ op: z.literal('unmount'), slot: NodeId }),
  z.object({ op: z.literal('insert'), parent: NodeId, index: z.number().int().optional(), node: LayoutNode }),
  z.object({ op: z.literal('remove'), id: NodeId }),
  z.object({ op: z.literal('replace'), id: NodeId, node: LayoutNode }),
  z.object({ op: z.literal('move'), id: NodeId, parent: NodeId, index: z.number().int().optional() }),
  z.object({ op: z.literal('update'), id: NodeId, patch: NodePatch }),
  z.object({ op: z.literal('setBlockProps'), slot: NodeId, props: z.record(z.string(), z.unknown()), merge: z.boolean().default(true) }),
  z.object({ op: z.literal('region'), region: z.enum(['left', 'right', 'bottom']), open: z.boolean().optional(), size: z.number().positive().optional(), node: LayoutNode.optional() }),
  z.object({ op: z.literal('overlay'), overlay: Overlay }),
  z.object({ op: z.literal('closeOverlay'), id: NodeId }),
])
export type LayoutOp = z.infer<typeof LayoutOp>

export type ApplyResult = { ok: true; workspace: Workspace } | { ok: false; error: string; opIndex: number }

/** Flattened description of the live layout, for the GenUI agent and dev tools. */
export interface SlotCatalogEntry {
  id: string
  kind: LayoutNode['kind'] | 'region' | 'overlay'
  region: RegionName | `overlay:${string}`
  path: string[]
  title?: string
  name?: string
  /** Last measured size in CSS pixels, if rendered. */
  size?: { width: number; height: number }
  block?: { id: string; type: string }
  contributions?: string[]
}

/**
 * Renderer-local service (`ctx.slots`). The data methods are also exposed to the
 * main process over the IPC bridge (as async); `register` is renderer-only.
 */
export interface RuntimeSlotsService {
  workspace(): Workspace
  apply(ops: LayoutOp[], options?: { persist?: boolean }): ApplyResult
  catalog(): SlotCatalogEntry[]
  /** Load a workspace file (`.diabase/workspaces/*.md` or any note with `diabase: workspace`). */
  open(path: VaultPath): Promise<void>
  /** Persist the current workspace; returns the path written. */
  save(path?: VaultPath): Promise<VaultPath>
  /** Path of the currently open workspace file, if any. */
  current(): VaultPath | null
}
