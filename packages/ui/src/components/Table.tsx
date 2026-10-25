import { useState, useMemo, type FC } from 'react'
import type { TableProps } from '@diabase/protocol'
import { Icon } from '../icons.tsx'

export const Table: FC<TableProps> = ({
  title,
  columns,
  rows,
  searchable = true,
  pagination = true,
  pageSize = 10,
  emptyMessage = 'No entries found',
}) => {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  const filteredRows = useMemo(() => {
    let result = [...rows]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((row) =>
        Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q)),
      )
    }

    if (sortKey) {
      result.sort((a, b) => {
        const valA = a[sortKey]
        const valB = b[sortKey]
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDir === 'asc' ? valA - valB : valB - valA
        }
        const strA = String(valA ?? '')
        const strB = String(valB ?? '')
        return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA)
      })
    }

    return result
  }, [rows, search, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = pagination
    ? filteredRows.slice((page - 1) * pageSize, page * pageSize)
    : filteredRows

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const formatCellValue = (val: unknown, type?: string) => {
    if (val === null || val === undefined) return '-'
    if (type === 'bytes' && typeof val === 'number') {
      if (val < 1024) return `${val} B`
      if (val < 1024 * 1024) return `${(val / 1024).toFixed(1)} KB`
      return `${(val / (1024 * 1024)).toFixed(1)} MB`
    }
    if (type === 'badge') {
      return <span className="db-badge db-badge-primary">{String(val)}</span>
    }
    if (type === 'code') {
      return <code style={{ color: '#818cf8', fontFamily: 'var(--diabase-font-mono)' }}>{String(val)}</code>
    }
    return String(val)
  }

  return (
    <div className="db-card db-table-container">
      {(title || searchable) && (
        <div className="db-table-toolbar">
          {title && <h4 className="db-card-title">{title}</h4>}
          {searchable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
              <Icon name="search" size={14} style={{ color: 'var(--diabase-text-dim)' }} />
              <input
                type="text"
                className="db-table-search"
                placeholder="Search table..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="db-table-scroll">
        <table className="db-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ textAlign: col.align || 'left' }}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--diabase-text-dim)' }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((col) => (
                    <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                      {formatCellValue(row[col.key], col.type)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="db-table-pagination">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              style={{
                background: 'var(--diabase-bg-subtle)',
                color: 'var(--diabase-text-main)',
                border: '1px solid var(--diabase-border)',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              Prev
            </button>
            <span style={{ padding: '4px 8px' }}>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{
                background: 'var(--diabase-bg-subtle)',
                color: 'var(--diabase-text-main)',
                border: '1px solid var(--diabase-border)',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
