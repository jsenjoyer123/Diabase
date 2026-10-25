import { describe, expectTypeOf, it } from 'vitest'
import type { VaultService } from '@diabase/protocol'
import type { Remote } from '@diabase/kernel'

interface Sample {
  sync(a: number, b?: string): string
  async(key: string): Promise<{ id: number }>
  nested: () => Promise<Promise<boolean>>
  optional?(): void
  prop: string
  readonly flag: boolean
  generic: (items: string[]) => string[]
  void(): void
}

describe('Remote<T>', () => {
  it('turns sync methods into promises and keeps async ones', () => {
    expectTypeOf<Remote<Sample>['sync']>().toEqualTypeOf<(a: number, b?: string) => Promise<string>>()
    expectTypeOf<Remote<Sample>['async']>().toEqualTypeOf<(key: string) => Promise<{ id: number }>>()
    expectTypeOf<Remote<Sample>['nested']>().toEqualTypeOf<() => Promise<boolean>>()
    expectTypeOf<Remote<Sample>['generic']>().toEqualTypeOf<(items: string[]) => Promise<string[]>>()
    expectTypeOf<Remote<Sample>['void']>().toEqualTypeOf<() => Promise<void>>()
  })

  it('drops non-method members', () => {
    expectTypeOf<keyof Remote<Sample>>().toEqualTypeOf<
      'sync' | 'async' | 'nested' | 'optional' | 'generic' | 'void'
    >()
    expectTypeOf<Remote<Sample>>().not.toHaveProperty('prop')
    expectTypeOf<Remote<Sample>>().not.toHaveProperty('flag')
  })

  it('keeps optional methods optional', () => {
    expectTypeOf<Remote<Sample>['optional']>().toEqualTypeOf<(() => Promise<void>) | undefined>()
  })

  it('maps a class instance with fields to its methods only', () => {
    class Counter {
      count = 0
      increment() {
        return ++this.count
      }
    }
    expectTypeOf<Remote<Counter>>().toEqualTypeOf<{ increment: () => Promise<number> }>()
  })

  it('is the identity for already-async service contracts', () => {
    expectTypeOf<Remote<VaultService>['read']>().toEqualTypeOf<VaultService['read']>()
    expectTypeOf<Remote<VaultService>['list']>().toEqualTypeOf<VaultService['list']>()
    expectTypeOf<Remote<VaultService>['writeBinary']>().toEqualTypeOf<VaultService['writeBinary']>()
  })
})
