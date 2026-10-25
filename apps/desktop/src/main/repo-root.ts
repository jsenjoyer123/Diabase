import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// The monorepo root is the nearest ancestor whose package.json declares `workspaces`.
// Walking up from our own location (not from process.cwd()) keeps it correct no matter
// where `npm run dev` was invoked, and it only matters in dev: a packaged app has no repo.
export function findRepoRoot(startDir: string): string | undefined {
  let dir = startDir
  for (;;) {
    if (declaresWorkspaces(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function declaresWorkspaces(packageJson: string): boolean {
  if (!existsSync(packageJson)) return false
  try {
    return 'workspaces' in JSON.parse(readFileSync(packageJson, 'utf8'))
  } catch {
    return false
  }
}
