// The only thing the preload exposes to the page (see src/preload/index.ts).
interface DiabaseBridge {
  /** Asks main for a MessagePort; it arrives as a `diabase:port` window message. */
  connect(): void
}

interface Window {
  diabase: DiabaseBridge
}
