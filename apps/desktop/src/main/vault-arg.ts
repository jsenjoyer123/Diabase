// Last occurrence wins. Accepts `--vault <path>` and `--vault=<path>`;
// a missing or empty value counts as absent.
export function parseVaultArg(argv: readonly string[]): string | undefined {
  let found: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--') break
    if (arg === '--vault') {
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        found = next
        i++
      }
    } else if (arg.startsWith('--vault=')) {
      found = arg.slice('--vault='.length)
    }
  }
  return found === '' ? undefined : found
}
