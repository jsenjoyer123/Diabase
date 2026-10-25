import type { FC } from 'react'
import type { CardsProps } from '@diabase/protocol'
import { Icon } from '../icons.tsx'

export const Cards: FC<CardsProps> = (props) => {
  const { title, columns = 3 } = props;
  const items = props.items || (props as any).cards || [];
  return (
    <div style={{ width: '100%' }}>
      {title && (
        <div style={{ marginBottom: '0.75rem' }}>
          <h4 className="db-card-title">{title}</h4>
        </div>
      )}

      <div
        className="db-cards-grid"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`,
        }}
      >
        {items.map((item, idx) => (
          <div key={item.id || idx} className="db-card db-card-item">
            <div>
              <div className="db-card-header">
                <div>
                  <div className="db-card-title">{item.title}</div>
                  {item.subtitle && <div className="db-card-subtitle">{item.subtitle}</div>}
                </div>
                {item.icon && (
                  <div className="db-stat-icon">
                    <Icon name={item.icon} size={16} />
                  </div>
                )}
                {item.badge && (
    <span className={`db-badge db-badge-${typeof item.badge === "object" && (item.badge as any).color ? (item.badge as any).color : "primary"}`}>
      {typeof item.badge === "object" ? (item.badge as any).text : String(item.badge)}
    </span>
  )}
              </div>

              {item.description && <div className="db-card-description">{item.description}</div>}

              {item.tags && item.tags.length > 0 && (
                <div className="db-card-tags">
                  {item.tags.map((tag, tIdx) => (
                    <span key={tIdx} className="db-badge db-badge-neutral">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {item.metrics && item.metrics.length > 0 && (
              <div className="db-card-metrics">
                {item.metrics.map((m, mIdx) => (
                  <div key={mIdx} className="db-card-metric-item">
                    <span className="db-card-metric-label">{m.label}</span>
                    <span className="db-card-metric-value">{m.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
