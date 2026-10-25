import { Context } from '@diabase/kernel'
import { createRoot } from 'react-dom/client'
import { plugConsole } from './console/plugins.ts'
import { createConsoleStores } from './console/state.ts'
import { ConsolePage } from './console/views.tsx'

// Renderer Cordis root. Stage 2 plugs the Bridge here, before the console plugins.
const root = new Context()
const stores = createConsoleStores()
plugConsole(root, stores)

createRoot(document.getElementById('root')!).render(<ConsolePage stores={stores} />)
