import React, { Component, useState, type FC, type ReactNode, type ErrorInfo } from 'react'
import type { BlockInstance, LayoutNode, Workspace } from '@diabase/protocol'
import { useBlockContext } from '@diabase/plugin-blocks'
import { Callout } from '@diabase/ui'

interface SlotErrorBoundaryProps {
  slotId: string
  blockType?: string
  children: ReactNode
}

interface SlotErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class SlotErrorBoundary extends Component<SlotErrorBoundaryProps, SlotErrorBoundaryState> {
  constructor(props: SlotErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): SlotErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[SlotErrorBoundary] Error in slot ${this.props.slotId} (${this.props.blockType}):`, error, errorInfo)
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '1rem', height: '100%' }}>
          <Callout
            kind="danger"
            title={`Block Error in Slot "${this.props.slotId}"`}
            message={this.state.error?.message || 'The block mounted in this slot crashed.'}
          />
        </div>
      )
    }
    return this.props.children
  }
}

export interface WorkspaceRendererProps {
  workspace: Workspace
  onApplyOps?: (ops: any[]) => void
}

export const WorkspaceRenderer: FC<WorkspaceRendererProps> = ({ workspace, onApplyOps }) => {
  return (
    <div
      className="diabase-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: '600px',
        background: 'var(--diabase-bg-canvas)',
        color: 'var(--diabase-text-main)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', flex: 1, width: '100%', overflow: 'hidden' }}>
        {/* Left Sidebar Region */}
        {workspace.left && workspace.left.open && (
          <aside
            style={{
              width: `${workspace.left.size || 280}px`,
              borderRight: '1px solid var(--diabase-border)',
              background: 'rgba(15, 23, 42, 0.6)',
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            <LayoutNodeRenderer node={workspace.left.node} onApplyOps={onApplyOps} />
          </aside>
        )}

        {/* Center Main Region */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <LayoutNodeRenderer node={workspace.main} onApplyOps={onApplyOps} />
        </main>

        {/* Right Sidebar Region */}
        {workspace.right && workspace.right.open && (
          <aside
            style={{
              width: `${workspace.right.size || 320}px`,
              borderLeft: '1px solid var(--diabase-border)',
              background: 'rgba(15, 23, 42, 0.6)',
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            <LayoutNodeRenderer node={workspace.right.node} onApplyOps={onApplyOps} />
          </aside>
        )}
      </div>

      {/* Bottom Panel Region */}
      {workspace.bottom && workspace.bottom.open && (
        <section
          style={{
            height: `${workspace.bottom.size || 240}px`,
            borderTop: '1px solid var(--diabase-border)',
            background: 'rgba(15, 23, 42, 0.8)',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <LayoutNodeRenderer node={workspace.bottom.node} onApplyOps={onApplyOps} />
        </section>
      )}
    </div>
  )
}

export const LayoutNodeRenderer: FC<{ node: LayoutNode; onApplyOps?: (ops: any[]) => void }> = ({
  node,
  onApplyOps,
}) => {
  switch (node.kind) {
    case 'split':
      return <SplitNodeRenderer node={node} onApplyOps={onApplyOps} />
    case 'tabs':
      return <TabsNodeRenderer node={node} onApplyOps={onApplyOps} />
    case 'grid':
      return <GridNodeRenderer node={node} onApplyOps={onApplyOps} />
    case 'stack':
      return <StackNodeRenderer node={node} onApplyOps={onApplyOps} />
    case 'slot':
      return <SlotNodeRenderer node={node} onApplyOps={onApplyOps} />
    default:
      return <div>Unknown node kind</div>
  }
}

const SplitNodeRenderer: FC<{ node: Extract<LayoutNode, { kind: 'split' }>; onApplyOps?: any }> = ({
  node,
  onApplyOps,
}) => {
  const isRow = node.direction === 'row'
  const sizes = node.sizes || node.children.map(() => 1)
  const total = sizes.reduce((a, b) => a + b, 0) || 1

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isRow ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {node.children.map((child, idx) => {
        const fraction = (sizes[idx] || 1) / total
        return (
          <div
            key={child.id || idx}
            style={{
              flex: fraction,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRight: isRow && idx < node.children.length - 1 ? '1px solid var(--diabase-border)' : undefined,
              borderBottom: !isRow && idx < node.children.length - 1 ? '1px solid var(--diabase-border)' : undefined,
            }}
          >
            <LayoutNodeRenderer node={child} onApplyOps={onApplyOps} />
          </div>
        )
      })}
    </div>
  )
}

const TabsNodeRenderer: FC<{ node: Extract<LayoutNode, { kind: 'tabs' }>; onApplyOps?: any }> = ({
  node,
  onApplyOps,
}) => {
  const [activeTab, setActiveTab] = useState(node.active || node.children[0]?.id || '')

  const activeChild = node.children.find((c) => c.id === activeTab) || node.children[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          background: 'rgba(15, 23, 42, 0.8)',
          borderBottom: '1px solid var(--diabase-border)',
          padding: '0 0.5rem',
        }}
      >
        {node.children.map((child) => (
          <button
            key={child.id}
            onClick={() => setActiveTab(child.id)}
            style={{
              background: activeTab === child.id ? 'var(--diabase-bg-card)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === child.id ? '2px solid var(--diabase-primary)' : '2px solid transparent',
              color: activeTab === child.id ? '#fff' : 'var(--diabase-text-muted)',
              padding: '0.5rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {child.title || child.id}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeChild && <LayoutNodeRenderer node={activeChild} onApplyOps={onApplyOps} />}
      </div>
    </div>
  )
}

const GridNodeRenderer: FC<{ node: Extract<LayoutNode, { kind: 'grid' }>; onApplyOps?: any }> = ({
  node,
  onApplyOps,
}) => {
  const cols = node.columns || 2
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `${node.gap || 12}px`,
        padding: '0.75rem',
        width: '100%',
        height: '100%',
        overflow: 'auto',
      }}
    >
      {node.children.map((child) => (
        <LayoutNodeRenderer key={child.id} node={child} onApplyOps={onApplyOps} />
      ))}
    </div>
  )
}

const StackNodeRenderer: FC<{ node: Extract<LayoutNode, { kind: 'stack' }>; onApplyOps?: any }> = ({
  node,
  onApplyOps,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: node.direction === 'row' ? 'row' : 'column',
        gap: `${node.gap || 8}px`,
        width: '100%',
        height: '100%',
        overflow: 'auto',
      }}
    >
      {node.children.map((child) => (
        <LayoutNodeRenderer key={child.id} node={child} onApplyOps={onApplyOps} />
      ))}
    </div>
  )
}

const SlotNodeRenderer: FC<{ node: Extract<LayoutNode, { kind: 'slot' }>; onApplyOps?: any }> = ({
  node,
  onApplyOps,
}) => {
  const { ctx } = useBlockContext()
  const block: BlockInstance | undefined = node.block

  if (!block) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '2rem',
          border: '1px dashed var(--diabase-border)',
          borderRadius: '8px',
          margin: '0.5rem',
          color: 'var(--diabase-text-dim)',
          fontSize: '0.85rem',
        }}
      >
        <span style={{ fontWeight: 600 }}>Empty Slot: {node.title || node.id}</span>
        <span>No block mounted</span>
      </div>
    )
  }

  // Look up registered block definition or manifest
  const blocks = ctx?.blocks as any
  const blockDef = blocks?.getDefinition ? blocks.getDefinition(block.type) : undefined
  const blockManifest = ctx?.blocks?.get(block.type)
  const BlockComponent = blockDef?.component

  return (
    <div
      className="db-slot-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--diabase-bg-surface)',
      }}
    >
      {/* Slot Chrome Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.4rem 0.75rem',
          background: 'rgba(15, 23, 42, 0.7)',
          borderBottom: '1px solid var(--diabase-border)',
          fontSize: '0.775rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--diabase-text-main)' }}>
            {block.title || blockManifest?.title || block.type}
          </span>
          <span className="db-badge db-badge-neutral" style={{ fontSize: '0.65rem' }}>
            {block.type}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {onApplyOps && (
            <button
              title="Split Slot Horizontally"
              onClick={() => {
                onApplyOps([
                  {
                    op: 'replace',
                    id: node.id,
                    node: {
                      kind: 'split',
                      id: `split-${Date.now()}`,
                      direction: 'row',
                      children: [
                        { ...node },
                        { kind: 'slot', id: `slot-${Date.now()}`, title: 'New Slot' },
                      ],
                    },
                  },
                ])
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--diabase-text-dim)',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              ⊞
            </button>
          )}
        </div>
      </div>

      {/* Slot Content with Error Boundary */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <SlotErrorBoundary slotId={node.id} blockType={block.type}>
          {BlockComponent ? (
            <BlockComponent
              instance={block}
              props={block.props}
              has={(part: string) => {
                if (block.parts?.include) return block.parts.include.includes(part)
                if (block.parts?.exclude) return !block.parts.exclude.includes(part)
                return true
              }}
              setProps={(patch: Record<string, unknown>) => {
                if (onApplyOps) {
                  onApplyOps([{ op: 'setBlockProps', slot: node.id, props: patch, merge: true }])
                }
              }}
            />
          ) : (
            <div style={{ padding: '1.5rem' }}>
              <Callout
                kind="warning"
                title={`Block Not Found: ${block.type}`}
                message={`The block type "${block.type}" is not registered in the block engine.`}
              />
            </div>
          )}
        </SlotErrorBoundary>
      </div>
    </div>
  )
}
