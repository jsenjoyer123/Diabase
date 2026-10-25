// Generative UI specification, component catalog schemas, and repository query contracts.
import { z } from 'zod'

export const UIComponentName = z.enum([
  'Stat',
  'Table',
  'List',
  'Cards',
  'Chart',
  'TagCloud',
  'Graph',
  'CodeViewer',
  'Markdown',
  'Grid',
  'Section',
  'Callout',
  'Badge',
])
export type UIComponentName = z.infer<typeof UIComponentName>

// Ready-made component prop schemas

export const StatPropsSchema = z.object({
  label: z.string().describe('Label or title of the metric'),
  value: z.union([z.string(), z.number()]).describe('Primary value displayed prominently'),
  subtext: z.string().optional().describe('Supporting subtext or caption'),
  delta: z
    .object({
      value: z.union([z.string(), z.number()]),
      trend: z.enum(['up', 'down', 'neutral']).default('neutral'),
      label: z.string().optional(),
    })
    .optional()
    .describe('Change or trend indicator'),
  icon: z.string().optional().describe('Icon identifier: code, file, git-branch, git-commit, alert-circle, check-circle, zap, layers, cpu, activity, book, tag'),
  color: z.enum(['primary', 'secondary', 'success', 'warning', 'danger', 'info']).default('primary').optional(),
})
export type StatProps = z.infer<typeof StatPropsSchema>

export const TableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  align: z.enum(['left', 'center', 'right']).default('left').optional(),
  type: z.enum(['text', 'number', 'badge', 'code', 'date', 'bytes']).default('text').optional(),
})
export const TablePropsSchema = z.object({
  title: z.string().optional(),
  columns: z.array(TableColumnSchema),
  rows: z.array(z.record(z.string(), z.unknown())),
  searchable: z.boolean().default(true).optional(),
  pagination: z.boolean().default(true).optional(),
  pageSize: z.number().default(10).optional(),
  emptyMessage: z.string().default('No entries found').optional(),
})
export type TableProps = z.infer<typeof TablePropsSchema>

export const ListItemSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  badge: z
    .object({
      text: z.string(),
      color: z.enum(['primary', 'secondary', 'success', 'warning', 'danger', 'info']).default('secondary'),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export const ListPropsSchema = z.object({
  title: z.string().optional(),
  items: z.array(ListItemSchema),
  divided: z.boolean().default(true).optional(),
  emptyMessage: z.string().default('No items').optional(),
})
export type ListProps = z.infer<typeof ListPropsSchema>

export const CardItemSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  badge: z.string().optional(),
  icon: z.string().optional(),
  tags: z.array(z.string()).default([]).optional(),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
      }),
    )
    .default([])
    .optional(),
})
export const CardsPropsSchema = z.object({
  title: z.string().optional(),
  columns: z.number().min(1).max(6).default(3).optional(),
  items: z.array(CardItemSchema),
})
export type CardsProps = z.infer<typeof CardsPropsSchema>

export const ChartDataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  color: z.string().optional(),
  subtext: z.string().optional(),
})
export const ChartPropsSchema = z.object({
  type: z.enum(['bar', 'donut', 'line', 'area', 'progress']),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  data: z.array(ChartDataPointSchema),
  unit: z.string().optional().describe('Unit for values, e.g. "lines", "%", "KB", "commits"'),
  showLegend: z.boolean().default(true).optional(),
})
export type ChartProps = z.infer<typeof ChartPropsSchema>

export const TagItemSchema = z.object({
  name: z.string(),
  count: z.number().optional(),
  color: z.enum(['primary', 'secondary', 'success', 'warning', 'danger', 'info', 'neutral']).default('primary').optional(),
})
export const TagCloudPropsSchema = z.object({
  title: z.string().optional(),
  tags: z.array(TagItemSchema),
})
export type TagCloudProps = z.infer<typeof TagCloudPropsSchema>

export const GraphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.string().optional(),
  size: z.number().default(10).optional(),
  color: z.string().optional(),
})
export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  weight: z.number().default(1).optional(),
})
export const GraphPropsSchema = z.object({
  title: z.string().optional(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  height: z.number().default(340).optional(),
})
export type GraphProps = z.infer<typeof GraphPropsSchema>

export const CodeViewerPropsSchema = z.object({
  code: z.string(),
  language: z.string().default('typescript').optional(),
  title: z.string().optional(),
  lineNumbers: z.boolean().default(true).optional(),
  highlightLines: z.array(z.number()).default([]).optional(),
})
export type CodeViewerProps = z.infer<typeof CodeViewerPropsSchema>

export const MarkdownPropsSchema = z.object({
  content: z.string(),
  title: z.string().optional(),
})
export type MarkdownProps = z.infer<typeof MarkdownPropsSchema>

export const GridPropsSchema = z.object({
  columns: z.union([z.number().min(1).max(12), z.string()]).default(2).optional(),
  gap: z.enum(['sm', 'md', 'lg']).default('md').optional(),
})
export type GridProps = z.infer<typeof GridPropsSchema>

export const SectionPropsSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  collapsible: z.boolean().default(false).optional(),
  badge: z.string().optional(),
})
export type SectionProps = z.infer<typeof SectionPropsSchema>

export const CalloutPropsSchema = z.object({
  kind: z.enum(['info', 'warning', 'success', 'danger', 'tip']).default('info').optional(),
  title: z.string().optional(),
  message: z.string(),
})
export type CalloutProps = z.infer<typeof CalloutPropsSchema>

export const BadgePropsSchema = z.object({
  text: z.string(),
  color: z.enum(['primary', 'secondary', 'success', 'warning', 'danger', 'info']).default('primary').optional(),
})
export type BadgeProps = z.infer<typeof BadgePropsSchema>

// Recursive UISpecNode and UISpec definitions

export type UISpecNode = {
  id?: string
  component: UIComponentName
  props?: Record<string, unknown>
  children?: UISpecNode[]
}

export const UISpecNodeSchema: z.ZodType<UISpecNode> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    component: UIComponentName,
    props: z.record(z.string(), z.unknown()).default({}),
    children: z.array(UISpecNodeSchema).default([]).optional(),
  }),
)

export const UISpecSchema = z.object({
  version: z.string().default('1.0.0'),
  title: z.string(),
  description: z.string().optional(),
  root: UISpecNodeSchema,
  queries: z.record(z.string(), z.unknown()).default({}).optional(),
})
export type UISpec = z.infer<typeof UISpecSchema>

// Validation map per component name
export const ComponentPropsValidators: Record<UIComponentName, z.ZodTypeAny> = {
  Stat: StatPropsSchema,
  Table: TablePropsSchema,
  List: ListPropsSchema,
  Cards: CardsPropsSchema,
  Chart: ChartPropsSchema,
  TagCloud: TagCloudPropsSchema,
  Graph: GraphPropsSchema,
  CodeViewer: CodeViewerPropsSchema,
  Markdown: MarkdownPropsSchema,
  Grid: GridPropsSchema,
  Section: SectionPropsSchema,
  Callout: CalloutPropsSchema,
  Badge: BadgePropsSchema,
}

/**
 * Validates a UISpecNode tree deeply, checking both structure and component-specific props.
 */
export function validateUISpecNode(node: unknown, path = 'root'): { valid: boolean; errors: string[] } {
  const nodeResult = UISpecNodeSchema.safeParse(node)
  if (!nodeResult.success) {
    return {
      valid: false,
      errors: nodeResult.error.issues.map((i) => `${path}: ${i.message} (path: ${i.path.join('.')})`),
    }
  }

  const errors: string[] = []
  const { component, props, children } = nodeResult.data

  const validator = ComponentPropsValidators[component]
  if (validator) {
    const propsResult = validator.safeParse(props || {})
    if (!propsResult.success) {
      propsResult.error.issues.forEach((i) => {
        errors.push(`${path} [${component}]: props.${i.path.join('.')} - ${i.message}`)
      })
    }
  }

  if (children && children.length > 0) {
    children.forEach((child, index) => {
      const childValidation = validateUISpecNode(child, `${path}.children[${index}]`)
      if (!childValidation.valid) {
        errors.push(...childValidation.errors)
      }
    })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validates a complete UISpec.
 */
export function validateUISpec(spec: unknown): { valid: boolean; data?: UISpec; errors: string[] } {
  const parsed = UISpecSchema.safeParse(spec)
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    }
  }

  const nodeValidation = validateUISpecNode(parsed.data.root)
  if (!nodeValidation.valid) {
    return { valid: false, errors: nodeValidation.errors }
  }

  return { valid: true, data: parsed.data, errors: [] }
}

// Repository data & query models for the explored codebase

export const RepoQuery = z.object({
  kind: z.enum(['files', 'git', 'symbols', 'languages', 'todos', 'dependencies', 'summary']),
  params: z.record(z.string(), z.unknown()).default({}),
})
export type RepoQuery = z.infer<typeof RepoQuery>

export interface RepoFacts {
  name: string
  rootPath: string
  branch: string
  totalFiles: number
  totalLinesOfCode: number
  languages: Array<{
    language: string
    extension: string
    files: number
    lines: number
    percentage: number
  }>
  recentCommits: Array<{
    hash: string
    message: string
    author: string
    date: string
  }>
  topFiles: Array<{
    path: string
    lines: number
    sizeBytes: number
    language: string
  }>
  todos: Array<{
    file: string
    line: number
    type: 'TODO' | 'FIXME' | 'NOTE'
    text: string
  }>
  dependencies: Array<{
    name: string
    version: string
    type: 'prod' | 'dev'
  }>
  structure: {
    packages: string[]
    plugins: string[]
    apps: string[]
  }
}

// Component Catalog Documentation for LLM prompt generation
export interface ComponentCatalogItem {
  component: UIComponentName
  description: string
  exampleProps: Record<string, unknown>
  allowedChildren?: boolean
}

export const COMPONENT_CATALOG: ComponentCatalogItem[] = [
  {
    component: 'Stat',
    description: 'Displays a single prominent metric or KPI with label, value, trend delta, icon, and color theme.',
    exampleProps: {
      label: 'Lines of Code',
      value: '24,580',
      subtext: 'across 142 files',
      delta: { value: '+1,240', trend: 'up', label: 'this week' },
      icon: 'code',
      color: 'primary',
    },
  },
  {
    component: 'Table',
    description: 'Sortable, searchable tabular list of rows with custom columns (text, number, badge, bytes, code, date).',
    exampleProps: {
      title: 'Top Files by Size',
      columns: [
        { key: 'path', label: 'File Path', type: 'code' },
        { key: 'lines', label: 'Lines', type: 'number' },
        { key: 'size', label: 'Size', type: 'bytes' },
        { key: 'language', label: 'Language', type: 'badge' },
      ],
      rows: [
        { path: 'packages/kernel/src/main/loader.ts', lines: 340, size: 12500, language: 'TypeScript' },
      ],
      searchable: true,
      pagination: true,
      pageSize: 5,
    },
  },
  {
    component: 'List',
    description: 'Structured list of items with titles, subtitles, icons, and status badges.',
    exampleProps: {
      title: 'Recent Git Commits',
      items: [
        {
          title: 'feat(kernel): plugin loader',
          subtitle: 'author: Lubyanoy Ivan',
          icon: 'git-commit',
          badge: { text: 'main', color: 'success' },
        },
      ],
    },
  },
  {
    component: 'Cards',
    description: 'Responsive grid of content cards for packages, modules, or features with badges, tags, and metrics.',
    exampleProps: {
      title: 'Repository Packages & Modules',
      columns: 3,
      items: [
        {
          title: '@diabase/kernel',
          subtitle: 'Core Cordis integration',
          description: 'Context typing, IPC bridge, plugin loader',
          badge: 'Core',
          tags: ['TypeScript', 'Cordis'],
          metrics: [{ label: 'Files', value: 8 }],
        },
      ],
    },
  },
  {
    component: 'Chart',
    description: 'Data visualizations: donut (distribution/shares), bar (comparisons), line/area (trends), progress (completion).',
    exampleProps: {
      type: 'donut',
      title: 'Language Distribution',
      unit: '%',
      data: [
        { label: 'TypeScript', value: 78, color: '#3178c6' },
        { label: 'Markdown', value: 15, color: '#0891b2' },
        { label: 'JSON', value: 7, color: '#f59e0b' },
      ],
    },
  },
  {
    component: 'TagCloud',
    description: 'Visual collection of tags or technologies with item counts and colored chips.',
    exampleProps: {
      title: 'Technologies & File Types',
      tags: [
        { name: 'TypeScript', count: 48, color: 'primary' },
        { name: 'React', count: 24, color: 'info' },
        { name: 'Zod', count: 12, color: 'success' },
      ],
    },
  },
  {
    component: 'Graph',
    description: 'Interactive node-link relationship diagram for module dependencies or file imports.',
    exampleProps: {
      title: 'Module Dependency Graph',
      nodes: [
        { id: 'kernel', label: '@diabase/kernel', category: 'core', color: '#6366f1' },
        { id: 'protocol', label: '@diabase/protocol', category: 'core', color: '#10b981' },
        { id: 'ui', label: '@diabase/ui', category: 'ui', color: '#ec4899' },
      ],
      edges: [
        { source: 'kernel', target: 'protocol', label: 'imports' },
        { source: 'ui', target: 'protocol', label: 'imports' },
      ],
    },
  },
  {
    component: 'CodeViewer',
    description: 'Syntax-highlighted code block with line numbers and file header.',
    exampleProps: {
      title: 'packages/kernel/src/index.ts',
      language: 'typescript',
      code: "export * from 'cordis'\nexport { Context as default } from 'cordis'",
    },
  },
  {
    component: 'Markdown',
    description: 'Formatted markdown document rendering headings, lists, quotes, and links.',
    exampleProps: {
      title: 'Project Overview',
      content: '### Diabase\nA Markdown-native knowledge base with a **Generative UI** block engine.',
    },
  },
  {
    component: 'Grid',
    description: 'Multi-column container for grouping components side-by-side.',
    exampleProps: {
      columns: 2,
      gap: 'md',
    },
    allowedChildren: true,
  },
  {
    component: 'Section',
    description: 'Card container with header, subtitle, and collapsible body.',
    exampleProps: {
      title: 'Code Quality & Technical Debt',
      subtitle: 'Scan of TODO and FIXME annotations',
      badge: 'Audit',
    },
    allowedChildren: true,
  },
  {
    component: 'Callout',
    description: 'Alert message box for important notices, recommendations, or warnings.',
    exampleProps: {
      kind: 'info',
      title: 'Repository Architecture Summary',
      message: 'This project is organized as an npm workspace monorepo with 5 packages and 12 plugins.',
    },
  },
  {
    component: 'Badge',
    description: 'Compact inline chip or status badge.',
    exampleProps: {
      text: 'Healthy',
      color: 'success',
    },
  },
]
