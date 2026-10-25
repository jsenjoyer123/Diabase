import { defineConfig } from 'vitest/config'

// Node environment by default. Renderer-side tests opt into a DOM with a
// `// @vitest-environment happy-dom` docblock at the top of the file.
export default defineConfig({
  test: {
    include: ['{packages,plugins,apps}/*/{src,test}/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
})
