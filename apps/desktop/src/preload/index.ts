import { contextBridge, ipcRenderer } from 'electron'

// The preload exposes the handshake and nothing else. A MessagePort cannot cross
// contextBridge, so the port is handed to the page through window.postMessage.
contextBridge.exposeInMainWorld('diabase', {
  connect: () => ipcRenderer.send('diabase:connect'),
})

ipcRenderer.on('diabase:port', (event) => {
  window.postMessage({ type: 'diabase:port' }, '*', event.ports)
})
