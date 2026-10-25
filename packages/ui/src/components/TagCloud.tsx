import type { FC } from 'react'
import type { TagCloudProps } from '@diabase/protocol'

export const TagCloud: FC<TagCloudProps> = ({ title, tags }) => {
  return (
    <div className="db-card" style={{ padding: '1rem' }}>
      {title && (
        <div style={{ marginBottom: '0.75rem' }}>
          <h4 className="db-card-title">{title}</h4>
        </div>
      )}

      <div className="db-tagcloud">
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className={`db-badge db-badge-${tag.color || 'primary'}`}
            style={{ fontSize: '0.825rem', padding: '0.35rem 0.75rem', gap: '0.4rem' }}
          >
            <span>{tag.name}</span>
            {tag.count !== undefined && (
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                }}
              >
                {tag.count}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
