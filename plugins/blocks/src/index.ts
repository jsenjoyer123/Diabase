import { createContext, useContext, createElement, type ComponentType } from 'react'
import type { Context } from '@diabase/kernel'
import type {
  BlockDefinition,
  BlockManifest,
  BlockProps,
  BlockRegistryService,
  ComposeSpec,
  SubsetSpec,
  VaultPath,
} from '@diabase/protocol'

export interface BlockRenderContext {
  ctx?: Context
  activeNotePath?: string
  setActiveNotePath?: (path: string) => void
  queryVault?: (query: any) => Promise<any[]>
}

export const BlockReactContext = createContext<BlockRenderContext>({})

export function useBlockContext(): BlockRenderContext {
  return useContext(BlockReactContext)
}

export class BlockRegistryServiceImpl implements BlockRegistryService {
  private definitions = new Map<string, BlockDefinition<any>>()
  private manifests = new Map<string, BlockManifest>()
  private ctx?: Context

  constructor(ctx?: Context) {
    this.ctx = ctx
  }

  /**
   * Register a code-backed block.
   */
  define<P = Record<string, unknown>>(def: BlockDefinition<P>): () => void {
    const type = def.manifest.type
    this.definitions.set(type, def)

    const manifest: BlockManifest = {
      type,
      title: def.manifest.title,
      description: def.manifest.description,
      version: def.manifest.version || '0.1.0',
      props: (def.manifest as any).props || { type: 'object', properties: {} },
      parts: (def.manifest as any).parts || {},
      data: (def.manifest as any).data || { note: 'none', query: 'none', writes: [] },
      regions: def.manifest.regions || ['main'],
      origin: def.manifest.origin || { kind: 'builtin', plugin: 'core' },
    }
    this.manifests.set(type, manifest)

    if (this.ctx && typeof this.ctx.emit === 'function') {
      this.ctx.emit('blocks/changed')
    }

    return () => {
      this.definitions.delete(type)
      this.manifests.delete(type)
      if (this.ctx && typeof this.ctx.emit === 'function') {
        this.ctx.emit('blocks/changed')
      }
    }
  }

  /**
   * Register a data-only manifest.
   */
  register(manifest: BlockManifest): () => void {
    this.manifests.set(manifest.type, manifest)
    if (this.ctx && typeof this.ctx.emit === 'function') {
      this.ctx.emit('blocks/changed')
    }
    return () => {
      this.manifests.delete(manifest.type)
      if (this.ctx && typeof this.ctx.emit === 'function') {
        this.ctx.emit('blocks/changed')
      }
    }
  }

  get(type: string): BlockManifest | undefined {
    return this.manifests.get(type)
  }

  getDefinition(type: string): BlockDefinition<any> | undefined {
    return this.definitions.get(type)
  }

  list(): BlockManifest[] {
    return Array.from(this.manifests.values())
  }

  subset(spec: SubsetSpec): BlockManifest {
    const base = this.definitions.get(spec.base)
    if (!base) {
      throw new Error(`Base block type "${spec.base}" not found`)
    }

    const manifest: BlockManifest = {
      type: spec.type,
      title: spec.title,
      description: spec.description,
      version: '0.1.0',
      props: (base.manifest as any).props || { type: 'object', properties: {} },
      parts: (base.manifest as any).parts || {},
      data: (base.manifest as any).data || { note: 'none', query: 'none', writes: [] },
      regions: base.manifest.regions || ['main'],
      origin: {
        kind: 'derived',
        extends: spec.base,
        defaults: spec.defaults || {},
        parts: spec.parts,
        bind: spec.bind,
        lockedProps: spec.lockedProps || [],
      },
    }

    const BaseComponent = base.component
    const DerivedComponent: ComponentType<BlockProps<any>> = (props) => {
      const mergedProps = {
        ...spec.defaults,
        ...props.props,
      }
      return createElement(BaseComponent, { ...props, props: mergedProps })
    }

    this.define({
      manifest,
      component: DerivedComponent,
    })

    return manifest
  }

  compose(spec: ComposeSpec): BlockManifest {
    const manifest: BlockManifest = {
      type: spec.type,
      title: spec.title,
      description: spec.description,
      version: '0.1.0',
      props: { type: 'object', properties: {} },
      parts: {},
      data: { note: 'none', query: 'none', writes: [] },
      regions: ['main'],
      origin: {
        kind: 'composite',
        layout: spec.layout,
      },
    }
    this.manifests.set(spec.type, manifest)
    return manifest
  }

  async persist(type: string): Promise<VaultPath> {
    return `.diabase/blocks/${type}/block.md` as VaultPath
  }
}

export default function apply(ctx: Context) {
  const service = new BlockRegistryServiceImpl(ctx)
  ctx.provide('blocks', service)
}
