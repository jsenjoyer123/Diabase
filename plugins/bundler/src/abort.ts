// Why a build stopped early. The reason is carried by the per-build AbortSignal.

export type AbortReason = 'timeout' | 'stopped'

export class BuildAbort extends Error {
  constructor(readonly reason: AbortReason) {
    super(reason === 'timeout' ? 'Build timed out' : 'Bundler stopped')
    this.name = 'BuildAbort'
  }
}
