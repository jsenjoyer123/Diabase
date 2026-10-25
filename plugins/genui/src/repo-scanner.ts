import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import type { RepoFacts, RepoQuery } from '@diabase/protocol'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.tmp',
  'dist',
  'out',
  'coverage',
  '.next',
  '.vite',
  'build',
  'trash',
  'cache',
])

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (React)',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (React)',
  '.json': 'JSON',
  '.md': 'Markdown',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.html': 'HTML',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.sh': 'Shell',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.sql': 'SQL',
}

export interface ScannedFile {
  relativePath: string
  extension: string
  language: string
  lines: number
  sizeBytes: number
  mtime: number
}

/**
 * Recursively scans a code repository to extract comprehensive metrics and structure facts.
 */
export async function scanRepository(targetPath: string): Promise<RepoFacts> {
  const rootPath = path.resolve(targetPath)
  let repoName = path.basename(rootPath)

  // Read root package.json if available
  let pkgDeps: Array<{ name: string; version: string; type: 'prod' | 'dev' }> = []
  const pkgJsonPath = path.join(rootPath, 'package.json')
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
      if (pkg.name) repoName = pkg.name
      if (pkg.dependencies) {
        for (const [name, version] of Object.entries(pkg.dependencies)) {
          pkgDeps.push({ name, version: String(version), type: 'prod' })
        }
      }
      if (pkg.devDependencies) {
        for (const [name, version] of Object.entries(pkg.devDependencies)) {
          pkgDeps.push({ name, version: String(version), type: 'dev' })
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Get current git branch & recent commits
  let branch = 'main'
  let recentCommits: Array<{ hash: string; message: string; author: string; date: string }> = []
  try {
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: rootPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (gitBranch) branch = gitBranch

    const gitLog = execSync('git log -n 8 --format="%h|%an|%ar|%s"', {
      cwd: rootPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (gitLog) {
      recentCommits = gitLog.split('\n').filter(Boolean).map((line) => {
        const [hash = '', author = '', date = '', message = ''] = line.split('|')
        return { hash, author, date, message }
      })
    }
  } catch {
    // Git might not be initialized or clean
  }

  // Detect monorepo workspaces/folders
  const structure = {
    packages: listDirectories(path.join(rootPath, 'packages')),
    plugins: listDirectories(path.join(rootPath, 'plugins')),
    apps: listDirectories(path.join(rootPath, 'apps')),
  }

  const files: ScannedFile[] = []
  const todos: Array<{ file: string; line: number; type: 'TODO' | 'FIXME' | 'NOTE'; text: string }> = []
  const langCounts: Record<string, { files: number; lines: number; extension: string }> = {}

  function walk(currentDir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(currentDir, entry.name))
        }
      } else if (entry.isFile()) {
        const fullPath = path.join(currentDir, entry.name)
        const relPath = path.relative(rootPath, fullPath)
        const ext = path.extname(entry.name).toLowerCase()
        const lang = EXT_TO_LANGUAGE[ext] || 'Other'

        try {
          const stats = fs.statSync(fullPath)
          const content = fs.readFileSync(fullPath, 'utf8')
          const lines = content.split('\n')
          const lineCount = lines.length

          files.push({
            relativePath: relPath,
            extension: ext,
            language: lang,
            lines: lineCount,
            sizeBytes: stats.size,
            mtime: stats.mtimeMs,
          })

          if (!langCounts[lang]) {
            langCounts[lang] = { files: 0, lines: 0, extension: ext || 'txt' }
          }
          langCounts[lang].files += 1
          langCounts[lang].lines += lineCount

          // Scan for TODO / FIXME / NOTE
          lines.forEach((l, idx) => {
            const match = l.match(/\b(TODO|FIXME|NOTE|HACK)\b[:\s]*(.*)/i)
            if (match && todos.length < 50) {
              const raw = (match[1] || '').toUpperCase()
              const type: 'TODO' | 'FIXME' | 'NOTE' = raw === 'NOTE' ? 'NOTE' : raw === 'FIXME' || raw === 'HACK' ? 'FIXME' : 'TODO'
              const text = (match[2] || '').trim()
              if (text) {
                todos.push({
                  file: relPath,
                  line: idx + 1,
                  type,
                  text: text.slice(0, 120),
                })
              }
            }
          })
        } catch {
          // Binary file or read error, ignore
        }
      }
    }
  }

  walk(rootPath)

  const totalLinesOfCode = files.reduce((acc, f) => acc + f.lines, 0)
  const languages = Object.entries(langCounts)
    .map(([language, data]) => ({
      language,
      extension: data.extension,
      files: data.files,
      lines: data.lines,
      percentage: totalLinesOfCode > 0 ? Math.round((data.lines / totalLinesOfCode) * 100) : 0,
    }))
    .sort((a, b) => b.lines - a.lines)

  const topFiles = [...files]
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 12)
    .map((f) => ({
      path: f.relativePath,
      lines: f.lines,
      sizeBytes: f.sizeBytes,
      language: f.language,
    }))

  return {
    name: repoName,
    rootPath,
    branch,
    totalFiles: files.length,
    totalLinesOfCode,
    languages,
    recentCommits,
    topFiles,
    todos,
    dependencies: pkgDeps,
    structure,
  }
}

function listDirectories(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
}

/**
 * Execute structured repository queries against the scanned facts.
 */
export function queryRepoFacts(query: RepoQuery, facts: RepoFacts): unknown {
  switch (query.kind) {
    case 'summary':
      return {
        name: facts.name,
        branch: facts.branch,
        totalFiles: facts.totalFiles,
        totalLinesOfCode: facts.totalLinesOfCode,
        packagesCount: facts.structure.packages.length + facts.structure.plugins.length + facts.structure.apps.length,
      }
    case 'languages':
      return facts.languages
    case 'git':
      return facts.recentCommits
    case 'files':
      return facts.topFiles
    case 'todos':
      return facts.todos
    case 'dependencies':
      return facts.dependencies
    default:
      return facts
  }
}
