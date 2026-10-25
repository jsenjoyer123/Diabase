import type { FC } from 'react'
import type { ListProps } from '@diabase/protocol'
import { Icon } from '../icons.tsx'

export const List: FC<ListProps> = ({
  title,
  items,
  divided = true,
  emptyMessage = 'No items found',
}) => {
  return (
    <div className="db-card" style={{ padding: '0.75rem 0' }}>
      {title && (
        <div style={{ padding: '0.5rem 1rem 0.75rem 1rem', borderBottom: '1px solid var(--diabase-border)' }}>
          <h4 className="db-card-title">{title}</h4>
        </div>
      )}

      <div className={`db-list ${divided ? 'db-list-divided' : ''}`}>
        {items.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--diabase-text-dim)' }}>
            {emptyMessage}
          </div>
        ) : (
          items.map((item, idx) => (
            <div key={item.id || idx} className="db-list-item">
              <div className="db-list-content">
                {item.icon && (
                  <div className="db-list-icon">
                    <Icon name={item.icon} size={16} />
                  </div>
                )}
                <div>
                  <div className="db-list-title">{item.title}</div>
                  {item.subtitle && <div className="db-list-subtitle">{item.subtitle}</div>}
                  {item.description && (
                    <div style={{ fontSize: '0.775rem', color: 'var(--diabase-text-dim)', marginTop: '2px' }}>
                      {item.description}
                    </div>
                  )}
                </div>
              </div>

              {item.badge && (
                <span className={`db-badge db-badge-${item.badge.color || 'secondary'}`}>
                  {item.badge.text}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
