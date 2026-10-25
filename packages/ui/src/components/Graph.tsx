import { useState, type FC } from 'react'
import type { GraphProps } from '@diabase/protocol'

export const Graph: FC<GraphProps> = ({ title, nodes, edges, height = 340 }) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Layout nodes around an ellipse / circle
  const width = 600
  const centerX = width / 2
  const centerY = height / 2
  const rx = width * 0.38
  const ry = height * 0.36

  const nodePositions = new Map<string, { x: number; y: number }>()
  nodes.forEach((node, i) => {
    const angle = (i / Math.max(1, nodes.length)) * 2 * Math.PI - Math.PI / 2
    const x = centerX + rx * Math.cos(angle)
    const y = centerY + ry * Math.sin(angle)
    nodePositions.set(node.id, { x, y })
  })

  return (
    <div className="db-card" style={{ padding: '1.25rem', overflow: 'hidden' }}>
      {title && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
          <h4 className="db-card-title">{title}</h4>
          <span style={{ fontSize: '0.8rem', color: 'var(--diabase-text-dim)' }}>
            {nodes.length} nodes · {edges.length} connections
          </span>
        </div>
      )}

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', maxHeight: `${height}px`, background: 'rgba(9, 13, 22, 0.4)', borderRadius: '8px' }}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255, 255, 255, 0.3)" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge, i) => {
            const src = nodePositions.get(edge.source)
            const dst = nodePositions.get(edge.target)
            if (!src || !dst) return null

            const isHighlighted = hoveredNode === edge.source || hoveredNode === edge.target
            const strokeColor = isHighlighted ? 'var(--diabase-primary)' : 'rgba(255, 255, 255, 0.15)'
            const strokeWidth = isHighlighted ? 2.5 : 1.5

            return (
              <g key={i}>
                <line
                  x1={src.x}
                  y1={src.y}
                  x2={dst.x}
                  y2={dst.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={edge.label ? '4 2' : undefined}
                  markerEnd="url(#arrow)"
                />
                {edge.label && (
                  <text
                    x={(src.x + dst.x) / 2}
                    y={(src.y + dst.y) / 2 - 4}
                    fill="var(--diabase-text-dim)"
                    fontSize="9"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = nodePositions.get(node.id)
            if (!pos) return null

            const isHovered = hoveredNode === node.id
            const color = node.color || 'var(--diabase-primary)'
            const size = node.size || 12

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <circle
                  r={size}
                  fill={color}
                  opacity={isHovered ? 1 : 0.85}
                  stroke="rgba(255, 255, 255, 0.4)"
                  strokeWidth={isHovered ? 2.5 : 1}
                  filter={isHovered ? 'drop-shadow(0 0 6px rgba(99, 102, 241, 0.6))' : undefined}
                />
                <text
                  y={size + 14}
                  fill={isHovered ? 'var(--diabase-text-main)' : 'var(--diabase-text-muted)'}
                  fontSize="11"
                  fontWeight={isHovered ? '600' : '400'}
                  textAnchor="middle"
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
