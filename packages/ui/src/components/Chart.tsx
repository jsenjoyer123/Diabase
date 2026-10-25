import type { FC } from 'react'
import type { ChartProps } from '@diabase/protocol'

const PALETTE = [
  '#6366f1', // indigo
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#3b82f6', // blue
  '#f97316', // orange
]

export const Chart: FC<ChartProps> = ({
  type,
  title,
  subtitle,
  data,
  unit = '',
  showLegend = true,
}) => {
  const total = data.reduce((acc, d) => acc + d.value, 0) || 1

  const renderDonut = () => {
    let accumulated = 0
    const size = 160
    const strokeWidth = 24
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
            {data.map((item, idx) => {
              const fraction = item.value / total
              const strokeDasharray = `${fraction * circumference} ${circumference}`
              const strokeDashoffset = -accumulated * circumference
              accumulated += fraction
              const color = item.color || PALETTE[idx % PALETTE.length]

              return (
                <circle
                  key={idx}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 0.4s ease' }}
                />
              )
            })}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--diabase-text-main)' }}>
              {data.length}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--diabase-text-dim)', textTransform: 'uppercase' }}>
              Items
            </span>
          </div>
        </div>

        {showLegend && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '160px' }}>
            {data.map((item, idx) => {
              const color = item.color || PALETTE[idx % PALETTE.length]
              const percent = ((item.value / total) * 100).toFixed(1)

              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: color }} />
                    <span style={{ color: 'var(--diabase-text-main)' }}>{item.label}</span>
                  </div>
                  <span style={{ color: 'var(--diabase-text-muted)', fontFamily: 'var(--diabase-font-mono)' }}>
                    {item.value} {unit} ({percent}%)
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const renderBar = () => {
    const maxVal = Math.max(...data.map((d) => d.value), 1)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {data.map((item, idx) => {
          const percent = (item.value / maxVal) * 100
          const color = item.color || PALETTE[idx % PALETTE.length]

          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                <span style={{ color: 'var(--diabase-text-main)', fontWeight: 500 }}>{item.label}</span>
                <span style={{ color: 'var(--diabase-text-muted)', fontFamily: 'var(--diabase-font-mono)' }}>
                  {item.value} {unit}
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--diabase-bg-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${percent}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                    borderRadius: '4px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderProgress = () => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {data.map((item, idx) => {
          const color = item.color || PALETTE[idx % PALETTE.length]
          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--diabase-text-main)' }}>{item.label}</span>
                <span style={{ fontWeight: 600, color: 'var(--diabase-text-main)' }}>{item.value}%</span>
              </div>
              <div style={{ height: '6px', background: 'var(--diabase-bg-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, item.value)}%`, height: '100%', background: color }} />
              </div>
              {item.subtext && (
                <span style={{ fontSize: '0.75rem', color: 'var(--diabase-text-dim)' }}>{item.subtext}</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderLine = () => {
    const width = 480
    const height = 140
    const padding = 20
    const maxVal = Math.max(...data.map((d) => d.value), 1)
    const points = data.map((d, i) => {
      const x = padding + (i / Math.max(1, data.length - 1)) * (width - padding * 2)
      const y = height - padding - (d.value / maxVal) * (height - padding * 2)
      return `${x},${y}`
    }).join(' ')

    return (
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', maxHeight: '180px' }}>
          <polyline
            fill="none"
            stroke="var(--diabase-primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
          {data.map((d, i) => {
            const x = padding + (i / Math.max(1, data.length - 1)) * (width - padding * 2)
            const y = height - padding - (d.value / maxVal) * (height - padding * 2)
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="4" fill="var(--diabase-primary)" />
                <text x={x} y={y - 8} fill="var(--diabase-text-muted)" fontSize="10" textAnchor="middle">
                  {d.value}
                </text>
                <text x={x} y={height - 4} fill="var(--diabase-text-dim)" fontSize="10" textAnchor="middle">
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  return (
    <div className="db-card db-chart-container">
      {(title || subtitle) && (
        <div className="db-chart-header">
          {title && <div className="db-chart-title">{title}</div>}
          {subtitle && <div className="db-chart-subtitle">{subtitle}</div>}
        </div>
      )}

      {type === 'donut' && renderDonut()}
      {type === 'bar' && renderBar()}
      {type === 'progress' && renderProgress()}
      {(type === 'line' || type === 'area') && renderLine()}
    </div>
  )
}
