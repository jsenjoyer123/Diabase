import type { FC } from 'react'
import type { StatProps } from '@diabase/protocol'
import { Icon } from '../icons.tsx'

export const Stat: FC<StatProps> = ({ label, value, subtext, delta, icon, color = 'primary' }) => {
  const accentColor = `var(--diabase-${color})`

  return (
    <div className="db-card db-stat" style={{ '--stat-accent': accentColor } as React.CSSProperties}>
      <div className="db-stat-header">
        <span className="db-stat-label">{label}</span>
        {icon && (
          <div className="db-stat-icon">
            <Icon name={icon} size={16} />
          </div>
        )}
      </div>

      <div className="db-stat-value">{value}</div>

      {(delta || subtext) && (
        <div className="db-stat-footer">
          {delta && (
            <span className={`db-stat-delta ${delta.trend || 'neutral'}`}>
              {delta.trend === 'up' && '▲ '}
              {delta.trend === 'down' && '▼ '}
              {delta.value}
              {delta.label ? ` ${delta.label}` : ''}
            </span>
          )}
          {subtext && <span className="db-stat-subtext">{subtext}</span>}
        </div>
      )}
    </div>
  )
}
