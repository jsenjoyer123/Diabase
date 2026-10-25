import React, { Component, type FC, type ReactNode, type ErrorInfo } from 'react'
import type { UISpec, UISpecNode } from '@diabase/protocol'
import { COMPONENT_REGISTRY, hasComponent, Callout } from '@diabase/ui'

interface ErrorBoundaryProps {
  componentName: string
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class NodeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[GenUIRenderer] Error rendering <${this.props.componentName}>:`, error, errorInfo)
  }

  override render() {
    if (this.state.hasError) {
      return (
        <Callout
          kind="danger"
          title={`Component Error: <${this.props.componentName}>`}
          message={this.state.error?.message || 'Failed to render this component.'}
        />
      )
    }
    return this.props.children
  }
}

export interface GenUIRendererProps {
  spec: UISpec
  className?: string
}

/**
 * Recursive GenUIRenderer that maps a validated UISpec to the ready-made React component catalog.
 */
export const GenUIRenderer: FC<GenUIRendererProps> = ({ spec, className = '' }) => {
  if (!spec || !spec.root) {
    return (
      <Callout
        kind="warning"
        title="Empty UISpec"
        message="No root component was provided in the specification."
      />
    )
  }

  return (
    <div className={`genui-root ${className}`}>
      {spec.title && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--diabase-text-main)', margin: 0 }}>
            {spec.title}
          </h2>
          {spec.description && (
            <p style={{ fontSize: '0.875rem', color: 'var(--diabase-text-muted)', marginTop: '0.35rem', marginBottom: 0 }}>
              {spec.description}
            </p>
          )}
        </div>
      )}

      {renderNode(spec.root, 'root')}
    </div>
  )
}

/**
 * Render a single UISpecNode and its recursive children.
 */
export function renderNode(node: UISpecNode, key: string): ReactNode {
  const { component: componentName, props = {}, children } = node

  if (!hasComponent(componentName)) {
    return (
      <Callout
        key={key}
        kind="warning"
        title={`Unknown Component: <${componentName}>`}
        message={`Component "${componentName}" does not exist in the @diabase/ui catalog.`}
      />
    )
  }

  const Component = COMPONENT_REGISTRY[componentName]

  // Render children if this node contains child nodes
  let renderedChildren: ReactNode = null
  if (children && children.length > 0) {
    renderedChildren = children.map((child, index) => renderNode(child, `${key}-${index}`))
  }

  return (
    <NodeErrorBoundary key={key} componentName={componentName}>
      <Component {...props}>{renderedChildren}</Component>
    </NodeErrorBoundary>
  )
}
