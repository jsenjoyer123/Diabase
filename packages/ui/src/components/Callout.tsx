import type { FC } from 'react'
import type { CalloutProps } from '@diabase/protocol'
import { Icon } from '../icons.tsx'

export const Callout: FC<CalloutProps> = ({ kind = 'info', title, message }) => {
  const getIcon = () => {
    switch (kind) {
      case 'warning':
        return 'alert-circle'
      case 'danger':
        return 'alert-circle'
      case 'success':
        return 'check-circle'
      case 'tip':
        return 'zap'
      default:
        return 'activity'
    }
  }

  return (
    <div className={`db-callout db-callout-${kind}`}>
      <div style={{ marginTop: '2px', color: `var(--diabase-${kind === 'tip' ? 'primary' : kind})` }}>
        <Icon name={getIcon()} size={18} />
      </div>
      <div>
        {title && <div className="db-callout-title">{title}</div>}
        <div className="db-callout-msg">{message}</div>
      </div>
    </div>
  )
}
