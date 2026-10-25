import type { Context } from '@diabase/kernel'
import type {
  ApplyResult,
  LayoutOp,
  RuntimeSlotsService,
  SlotCatalogEntry,
  VaultPath,
  Workspace,
} from '@diabase/protocol'
import { applyOps } from './ops.ts'
export { WorkspaceRenderer, LayoutNodeRenderer } from './renderer.tsx'
export { applyOps, findNode } from './ops.ts'

export const DEFAULT_WORKSPACE: Workspace = {
  version: 1,
  id: 'workspace-default',
  title: 'Default Workspace',
  main: {
    kind: 'split',
    id: 'main-split',
    direction: 'row',
    sizes: [1, 1],
    children: [
      {
        kind: 'slot',
        id: 'slot-editor',
        title: 'Markdown Editor',
        block: {
          id: 'instance-editor',
          type: 'core/editor',
          props: { path: 'Welcome.md' },
        },
      },
      {
        kind: 'slot',
        id: 'slot-preview',
        title: 'Dashboard Preview',
        block: {
          id: 'instance-cards',
          type: 'core/cards',
          props: { title: 'Vault Collections' },
        },
      },
    ],
  },
  left: {
    open: true,
    size: 260,
    node: {
      kind: 'slot',
      id: 'slot-files',
      title: 'File Explorer',
      block: {
        id: 'instance-files',
        type: 'files/tree',
        props: {},
      },
    },
  },
  bottom: {
    open: false,
    size: 260,
    node: {
      kind: 'slot',
      id: 'slot-genui',
      title: 'Generative UI Assistant',
      block: {
        id: 'instance-genui',
        type: 'genui/panel',
        props: {},
      },
    },
  },
  overlays: [],
}

export class RuntimeSlotsServiceImpl implements RuntimeSlotsService {
  private currentWorkspace: Workspace
  private currentPath: VaultPath | null = null
  private ctx?: Context

  constructor(ctx?: Context, initialWorkspace?: Workspace) {
    this.ctx = ctx
    this.currentWorkspace = initialWorkspace || DEFAULT_WORKSPACE
  }

  workspace(): Workspace {
    return this.currentWorkspace
  }

  apply(ops: LayoutOp[], options?: { persist?: boolean }): ApplyResult {
    const result = applyOps(this.currentWorkspace, ops)
    if (result.ok) {
      this.currentWorkspace = result.workspace
      if (this.ctx && typeof this.ctx.emit === 'function') {
        this.ctx.emit('slots/changed')
      }
    }
    return result
  }

  catalog(): SlotCatalogEntry[] {
    const entries: SlotCatalogEntry[] = []
    function walk(node: any, path: string[], region: any) {
      entries.push({
        id: node.id,
        kind: node.kind,
        region,
        path,
        title: node.title,
        name: node.name,
        block: node.block ? { id: node.block.id, type: node.block.type } : undefined,
      })
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((c: any) => walk(c, [...path, node.id], region))
      }
    }

    walk(this.currentWorkspace.main, [], 'main')
    if (this.currentWorkspace.left?.node) walk(this.currentWorkspace.left.node, [], 'left')
    if (this.currentWorkspace.right?.node) walk(this.currentWorkspace.right.node, [], 'right')
    if (this.currentWorkspace.bottom?.node) walk(this.currentWorkspace.bottom.node, [], 'bottom')
    return entries
  }

  async open(path: VaultPath): Promise<void> {
    this.currentPath = path
    if (this.ctx && typeof this.ctx.emit === 'function') {
      this.ctx.emit('slots/changed')
    }
  }

  async save(path?: VaultPath): Promise<VaultPath> {
    const savePath = path || this.currentPath || ('.diabase/workspaces/default.md' as VaultPath)
    this.currentPath = savePath
    return savePath
  }

  current(): VaultPath | null {
    return this.currentPath
  }
}

export default function apply(ctx: Context) {
  const service = new RuntimeSlotsServiceImpl(ctx)
  ctx.provide('slots', service)
}
