import type { ApplyResult, LayoutNode, LayoutOp, Workspace } from '@diabase/protocol'

/**
 * Executes a sequence of LayoutOps on a Workspace immutably.
 */
export function applyOps(workspace: Workspace, ops: LayoutOp[]): ApplyResult {
  let current: Workspace = JSON.parse(JSON.stringify(workspace))

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!
    try {
      current = executeOp(current, op)
    } catch (err: any) {
      return { ok: false, error: err.message || 'Operation failed', opIndex: i }
    }
  }

  return { ok: true, workspace: current }
}

function executeOp(ws: Workspace, op: LayoutOp): Workspace {
  switch (op.op) {
    case 'mount': {
      const slot = findNode(ws, op.slot)
      if (!slot || slot.kind !== 'slot') {
        throw new Error(`Target slot "${op.slot}" not found or is not a slot node`)
      }
      slot.block = op.block
      return ws
    }

    case 'unmount': {
      const slot = findNode(ws, op.slot)
      if (!slot || slot.kind !== 'slot') {
        throw new Error(`Target slot "${op.slot}" not found`)
      }
      delete slot.block
      return ws
    }

    case 'setBlockProps': {
      const slot = findNode(ws, op.slot)
      if (!slot || slot.kind !== 'slot' || !slot.block) {
        throw new Error(`Slot "${op.slot}" has no mounted block`)
      }
      slot.block.props = op.merge ? { ...slot.block.props, ...op.props } : op.props
      return ws
    }

    case 'insert': {
      const parent = findNode(ws, op.parent)
      if (!parent || !('children' in parent)) {
        throw new Error(`Parent "${op.parent}" is not a container node`)
      }
      const children = (parent as any).children as LayoutNode[]
      if (typeof op.index === 'number' && op.index >= 0 && op.index <= children.length) {
        children.splice(op.index, 0, op.node)
      } else {
        children.push(op.node)
      }
      return ws
    }

    case 'replace': {
      if (ws.main.id === op.id) {
        ws.main = op.node
        return ws
      }
      const replaced = replaceNodeInTree(ws.main, op.id, op.node)
      if (!replaced) {
        throw new Error(`Node "${op.id}" not found to replace`)
      }
      return ws
    }

    case 'remove': {
      if (ws.main.id === op.id) {
        throw new Error(`Cannot remove root main layout node`)
      }
      removeNodeFromTree(ws.main, op.id)
      return ws
    }

    case 'update': {
      const node = findNode(ws, op.id)
      if (!node) {
        throw new Error(`Node "${op.id}" not found to update`)
      }
      Object.assign(node, op.patch)
      return ws
    }

    case 'region': {
      const region = ws[op.region]
      if (region) {
        if (op.open !== undefined) region.open = op.open
        if (op.size !== undefined) region.size = op.size
        if (op.node !== undefined) region.node = op.node
      }
      return ws
    }

    case 'overlay': {
      const existingIdx = ws.overlays.findIndex((o) => o.id === op.overlay.id)
      if (existingIdx >= 0) {
        ws.overlays[existingIdx] = op.overlay
      } else {
        ws.overlays.push(op.overlay)
      }
      return ws
    }

    case 'closeOverlay': {
      ws.overlays = ws.overlays.filter((o) => o.id !== op.id)
      return ws
    }

    default:
      return ws
  }
}

export function findNode(ws: Workspace, id: string): LayoutNode | null {
  const inMain = findInNode(ws.main, id)
  if (inMain) return inMain

  if (ws.left?.node) {
    const found = findInNode(ws.left.node, id)
    if (found) return found
  }
  if (ws.right?.node) {
    const found = findInNode(ws.right.node, id)
    if (found) return found
  }
  if (ws.bottom?.node) {
    const found = findInNode(ws.bottom.node, id)
    if (found) return found
  }

  for (const overlay of ws.overlays) {
    const found = findInNode(overlay.node, id)
    if (found) return found
  }

  return null
}

function findInNode(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) return node
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findInNode(child, id)
      if (found) return found
    }
  }
  return null
}

function replaceNodeInTree(root: LayoutNode, id: string, replacement: LayoutNode): boolean {
  if ('children' in root && Array.isArray(root.children)) {
    for (let i = 0; i < root.children.length; i++) {
      if (root.children[i]!.id === id) {
        root.children[i] = replacement
        return true
      }
      if (replaceNodeInTree(root.children[i]!, id, replacement)) {
        return true
      }
    }
  }
  return false
}

function removeNodeFromTree(root: LayoutNode, id: string): boolean {
  if ('children' in root && Array.isArray(root.children)) {
    const idx = root.children.findIndex((c) => c.id === id)
    if (idx >= 0) {
      root.children.splice(idx, 1)
      return true
    }
    for (const child of root.children) {
      if (removeNodeFromTree(child, id)) return true
    }
  }
  return false
}
