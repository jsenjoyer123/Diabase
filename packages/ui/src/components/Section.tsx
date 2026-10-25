import { useState, type FC, type ReactNode } from 'react'
import type { SectionProps } from '@diabase/protocol'

export const Section: FC<SectionProps & { children?: ReactNode }> = ({
  title,
  subtitle,
  collapsible = false,
  badge,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="db-card db-section">
      <div
        className="db-section-header"
        style={{ cursor: collapsible ? 'pointer' : 'default' }}
        onClick={() => collapsible && setCollapsed((c) => !c)}
      >
        <div className="db-section-title-wrap">
          <div className="db-section-title">
            <span>{title}</span>
            {badge && (
    <span className={`db-badge db-badge-${typeof badge === "object" && (badge as any).color ? (badge as any).color : "primary"}`}>
      {typeof badge === "object" ? (badge as any).text : String(badge)}
    </span>
  )}
          </div>
          {subtitle && <span className="db-section-subtitle">{subtitle}</span>}
        </div>

        {collapsible && (
          <span style={{ color: 'var(--diabase-text-dim)', fontSize: '0.8rem' }}>
            {collapsed ? '▶ Show' : '▼ Hide'}
          </span>
        )}
      </div>

      {!collapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{children}</div>}
    </div>
  )
}
