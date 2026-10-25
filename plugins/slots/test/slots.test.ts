import { describe, expect, it } from 'vitest'
import {
  applyOps,
  DEFAULT_WORKSPACE,
  RuntimeSlotsServiceImpl,
} from '../src/index.ts'
import type { LayoutOp } from '@diabase/protocol'

describe('plugins/slots (DeepSeek Harness runtimeSlots & LayoutOp engine)', () => {
  it('applies mount and unmount ops cleanly', () => {
    const ws = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE))
    const mountOp: LayoutOp = {
      op: 'mount',
      slot: 'slot-editor',
      block: {
        id: 'new-block-1',
        type: 'core/table',
        props: { title: 'Books Table' },
      },
    }

    const result = applyOps(ws, [mountOp])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const main = result.workspace.main as any
      expect(main.children[0].block.type).toBe('core/table')
      expect(main.children[0].block.props.title).toBe('Books Table')
    }
  })

  it('updates block props via setBlockProps op', () => {
    const ws = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE))
    const propOp: LayoutOp = {
      op: 'setBlockProps',
      slot: 'slot-editor',
      props: { path: 'Books/Dune.md', readOnly: true },
      merge: true,
    }

    const result = applyOps(ws, [propOp])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const main = result.workspace.main as any
      expect(main.children[0].block.props.path).toBe('Books/Dune.md')
      expect(main.children[0].block.props.readOnly).toBe(true)
    }
  })

  it('replaces a layout node with split or tabs', () => {
    const ws = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE))
    const replaceOp: LayoutOp = {
      op: 'replace',
      id: 'slot-editor',
      node: {
        kind: 'tabs',
        id: 'editor-tabs',
        active: 'tab-1',
        children: [
          { kind: 'slot', id: 'tab-1', title: 'Note 1' },
          { kind: 'slot', id: 'tab-2', title: 'Note 2' },
        ],
      },
    }

    const result = applyOps(ws, [replaceOp])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const main = result.workspace.main as any
      expect(main.children[0].kind).toBe('tabs')
      expect(main.children[0].children.length).toBe(2)
    }
  })

  it('controls sidebar region opening and sizing', () => {
    const ws = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE))
    const regionOp: LayoutOp = {
      op: 'region',
      region: 'left',
      open: false,
      size: 320,
    }

    const result = applyOps(ws, [regionOp])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.workspace.left?.open).toBe(false)
      expect(result.workspace.left?.size).toBe(320)
    }
  })

  it('service lists slot catalog accurately', () => {
    const service = new RuntimeSlotsServiceImpl()
    const catalog = service.catalog()
    expect(catalog.length).toBeGreaterThan(0)
    expect(catalog.some((c) => c.id === 'slot-editor')).toBe(true)
    expect(catalog.some((c) => c.block?.type === 'core/editor')).toBe(true)
  })
})
