import type { FC } from 'react'
import type { BadgeProps } from '@diabase/protocol'

export const Badge: FC<BadgeProps> = ({ text, color = 'primary' }) => {
  return <span className={`db-badge db-badge-${color}`}>{text}</span>
}
