import { Service, type Context } from '@diabase/kernel'
import type { QuickOpenHit, SearchHit, SearchService, VaultPath } from '@diabase/protocol'
import { SearchEngine } from './engine.ts'

/** Cordis service `search`: BM25 full-text search and fuzzy quick-open over the vault. */
export class SearchPlugin extends Service implements SearchService {
  static inject = ['vault', 'index']

  // Shared by every Cordis proxy of this service (see engine.ts).
  readonly engine: SearchEngine

  constructor(ctx: Context) {
    super(ctx, 'search')
    this.engine = new SearchEngine(ctx.vault, ctx.index, (error) => ctx.logger('search').warn(error))
    ctx.on('index/updated', (paths) => {
      void this.engine.update(paths)
    })
    ctx.effect(() => () => this.engine.stop())
  }

  async [Service.init](): Promise<void> {
    await this.engine.build()
  }

  search(text: string, options?: { limit?: number; folder?: VaultPath; tag?: string }): Promise<SearchHit[]> {
    return this.engine.search(text, options)
  }

  async quickOpen(_text: string, _options?: { limit?: number }): Promise<QuickOpenHit[]> {
    return []
  }
}
