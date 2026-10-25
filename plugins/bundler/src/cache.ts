// Small LRU keyed by build hash. `Map` iteration order is insertion order, so re-inserting on
// access keeps the least recently used entry first.

export class LruCache<V> {
  readonly #entries = new Map<string, V>()

  constructor(private capacity: number) {}

  get size(): number {
    return this.#entries.size
  }

  get(key: string): V | undefined {
    const value = this.#entries.get(key)
    if (value === undefined) return undefined
    this.#entries.delete(key)
    this.#entries.set(key, value)
    return value
  }

  set(key: string, value: V): void {
    if (this.capacity <= 0) return
    this.#entries.delete(key)
    this.#entries.set(key, value)
    while (this.#entries.size > this.capacity) {
      const oldest = this.#entries.keys().next()
      if (oldest.done) break
      this.#entries.delete(oldest.value)
    }
  }

  clear(): void {
    this.#entries.clear()
  }
}
