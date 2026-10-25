import type { FC, ReactNode } from 'react'
import type { GridProps } from '@diabase/protocol'

export const Grid: FC<GridProps & { children?: ReactNode }> = ({
  columns = 2,
  gap = 'md',
  children,
}) => {
  const colStyle = typeof columns === 'number'
    ? `repeat(${columns}, minmax(0, 1fr))`
    : columns

  return (
    <div
      className={`db-grid db-grid-gap-${gap}`}
      style={{
        gridTemplateColumns: colStyle,
      }}
    >
      {children}
    </div>
  )
}
