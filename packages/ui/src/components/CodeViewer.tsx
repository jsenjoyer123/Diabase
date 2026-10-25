import { useState, type FC } from 'react'
import type { CodeViewerProps } from '@diabase/protocol'

export const CodeViewer: FC<CodeViewerProps> = ({
  code,
  language = 'typescript',
  title,
  lineNumbers = true,
  highlightLines = [],
}) => {
  const [copied, setCopied] = useState(false)
  const lines = code.split('\n')

  const copyCode = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="db-code-viewer">
      {(title || language) && (
        <div className="db-code-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            {title && <span style={{ marginLeft: '0.5rem', fontWeight: 600, color: 'var(--diabase-text-main)' }}>{title}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>{language}</span>
            <button
              onClick={copyCode}
              style={{
                background: 'transparent',
                border: '1px solid var(--diabase-border)',
                color: 'var(--diabase-text-muted)',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <pre className="db-code-body">
        {lines.map((line, idx) => {
          const lineNum = idx + 1
          const isHighlighted = highlightLines.includes(lineNum)

          return (
            <div
              key={idx}
              className="db-code-line"
              style={{
                backgroundColor: isHighlighted ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              }}
            >
              {lineNumbers && <span className="db-code-line-num">{lineNum}</span>}
              <span className="db-code-line-content">{line || ' '}</span>
            </div>
          )
        })}
      </pre>
    </div>
  )
}
