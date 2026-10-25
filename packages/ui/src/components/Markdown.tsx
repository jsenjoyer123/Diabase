import type { FC } from 'react'
import type { MarkdownProps } from '@diabase/protocol'

export const Markdown: FC<MarkdownProps> = ({ title, content }) => {
  // Simple, robust markdown processor without heavy third-party deps
  const renderLines = (text: string) => {
    const lines = text.split('\n')
    return lines.map((line, idx) => {
      if (line.startsWith('### ')) {
        return <h3 key={idx}>{line.slice(4)}</h3>
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx}>{line.slice(3)}</h2>
      }
      if (line.startsWith('# ')) {
        return <h1 key={idx}>{line.slice(2)}</h1>
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={idx} style={{ marginLeft: '1.25rem', marginBottom: '0.25rem' }}>
            {formatInline(line.slice(2))}
          </li>
        )
      }
      if (line.startsWith('> ')) {
        return (
          <blockquote
            key={idx}
            style={{
              borderLeft: '3px solid var(--diabase-primary)',
              paddingLeft: '0.75rem',
              color: 'var(--diabase-text-muted)',
              margin: '0.5rem 0',
            }}
          >
            {formatInline(line.slice(2))}
          </blockquote>
        )
      }
      if (line.trim() === '') {
        return <div key={idx} style={{ height: '0.5rem' }} />
      }
      return <p key={idx}>{formatInline(line)}</p>
    })
  }

  const formatInline = (text: string) => {
    // Bold **text**
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: 'var(--diabase-text-main)' }}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i}>{part.slice(1, -1)}</code>
      }
      return part
    })
  }

  return (
    <div className="db-card db-markdown">
      {title && (
        <div style={{ marginBottom: '0.75rem', borderBottom: '1px solid var(--diabase-border)', paddingBottom: '0.5rem' }}>
          <h4 className="db-card-title">{title}</h4>
        </div>
      )}
      <div>{renderLines(content)}</div>
    </div>
  )
}
