import { useState } from 'react'
import type { BlockProps } from '@diabase/sdk'

export interface HelloProps {
  name?: string
}

export default function Hello({ props }: BlockProps<HelloProps>) {
  const [waves, setWaves] = useState(0)
  const name = props.name?.trim() || 'world'
  return (
    <div className="demo-hello">
      <p>Hello, {name}!</p>
      <button type="button" onClick={() => setWaves((n) => n + 1)}>
        Wave ({waves})
      </button>
    </div>
  )
}
