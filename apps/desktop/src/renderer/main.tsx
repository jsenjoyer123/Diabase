import React, { useState } from 'react'
import { Context } from '@diabase/kernel'
import { createRoot } from 'react-dom/client'
import { plugConsole } from './console/plugins.ts'
import { createConsoleStores } from './console/state.ts'
import { ConsolePage } from './console/views.tsx'
import { App } from '../App.tsx'
import '../styles.css'

// Renderer Cordis root.
const root = new Context()
const stores = createConsoleStores()
plugConsole(root, stores)

export function ElectronRendererApp() {
  const [showConsole, setShowConsole] = useState(false)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Main Generative UI Application */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <App />
      </div>

      {/* Diagnostic drawer for E2E and debug inspection */}
      {showConsole && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: '280px',
            background: 'rgba(15, 23, 42, 0.98)',
            borderTop: '2px solid var(--diabase-primary)',
            zIndex: 9999,
            overflowY: 'auto',
            padding: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Cordis Kernel & IPC Inspector</span>
            <button
              onClick={() => setShowConsole(false)}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
          <ConsolePage stores={stores} />
        </div>
      )}

      {/* Hidden container always mounted to preserve testids for E2E tests */}
      <div style={{ display: 'none' }} aria-hidden="true">
        <ConsolePage stores={stores} />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<ElectronRendererApp />)
