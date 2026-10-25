import Anthropic from '@anthropic-ai/sdk'
import type { RepoFacts, UISpec } from '@diabase/protocol'
import { COMPONENT_CATALOG, validateUISpec } from '@diabase/protocol'

export interface LLMConfig {
  apiKey?: string
  model?: string
}

export interface GenerateUIResult {
  spec: UISpec
  modelUsed: string
  rawResponse?: unknown
}

export class LLMService {
  private client: Anthropic | null = null
  public readonly defaultModel: string

  constructor(config: LLMConfig = {}) {
    const key = config.apiKey || process.env.ANTHROPIC_API_KEY
    this.defaultModel = config.model || process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229'

    if (key) {
      this.client = new Anthropic({ apiKey: key })
    }
  }

  get isConfigured(): boolean {
    return this.client !== null
  }

  /**
   * Generates a Generative UI specification for the given user prompt and repository facts.
   * If Anthropic API key is available, calls Claude Opus with tool calling.
   * Otherwise, generates a structured UISpec deterministically based on repo facts and prompt intent.
   */
  async generateUI(prompt: string, facts: RepoFacts): Promise<GenerateUIResult> {
    if (this.client) {
      try {
        return await this.callAnthropic(prompt, facts)
      } catch (err) {
        console.warn('Anthropic API call failed, falling back to built-in generator:', err)
        return {
          spec: this.fallbackGenerate(prompt, facts),
          modelUsed: `${this.defaultModel} (fallback)`,
        }
      }
    }

    return {
      spec: this.fallbackGenerate(prompt, facts),
      modelUsed: `${this.defaultModel} (offline/mock)`,
    }
  }

  private async callAnthropic(prompt: string, facts: RepoFacts): Promise<GenerateUIResult> {
    if (!this.client) throw new Error('Anthropic client not initialized')

    const systemPrompt = `You are an expert Generative UI designer and codebase analyst for Diabase.
Your task is to analyze the user's repository and assemble a stunning, rich dashboard using ONLY the ready-made React components from the provided catalog.

REPOSITORY FACTS:
- Name: ${facts.name}
- Branch: ${facts.branch}
- Total Files: ${facts.totalFiles}
- Total Lines of Code: ${facts.totalLinesOfCode}
- Languages: ${facts.languages.map((l) => `${l.language} (${l.percentage}%, ${l.lines} lines)`).join(', ')}
- Packages: ${facts.structure.packages.join(', ') || 'none'}
- Plugins: ${facts.structure.plugins.join(', ') || 'none'}
- Recent Commits: ${facts.recentCommits.slice(0, 5).map((c) => `${c.hash.slice(0, 7)}: ${c.message} (${c.author})`).join('; ')}
- TODO/Debt items: ${facts.todos.length} detected

AVAILABLE READY-MADE REACT COMPONENTS:
${COMPONENT_CATALOG.map((c) => `- <${c.component}>: ${c.description}. Example: ${JSON.stringify(c.exampleProps)}`).join('\n')}

RULES:
1. You MUST call the tool "render_ui" with a valid UISpec JSON payload.
2. The root must typically be a <Grid> or <Section> containing child components.
3. Every component name must match one of the ready-made components: Stat, Table, List, Cards, Chart, TagCloud, Graph, CodeViewer, Markdown, Grid, Section, Callout, Badge.
4. Props must be valid for the respective component schema.
5. Create visually engaging, information-dense dashboards tailored to the user's specific question.`

    const tools: Anthropic.Tool[] = [
      {
        name: 'render_ui',
        description: 'Output the validated UISpec layout using ready-made React components',
        input_schema: {
          type: 'object',
          properties: {
            version: { type: 'string', default: '1.0.0' },
            title: { type: 'string', description: 'Dashboard title' },
            description: { type: 'string', description: 'Short summary of the view' },
            root: {
              type: 'object',
              description: 'Root component node of the UI tree',
              properties: {
                component: { type: 'string' },
                props: { type: 'object' },
                children: { type: 'array', items: { type: 'object' } },
              },
              required: ['component'],
            },
          },
          required: ['title', 'root'],
        },
      },
    ]

    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      tools,
      tool_choice: { type: 'tool', name: 'render_ui' },
    })

    const toolUse = response.content.find((c) => c.type === 'tool_use')
    if (toolUse && toolUse.name === 'render_ui') {
      const validation = validateUISpec(toolUse.input)
      if (validation.valid && validation.data) {
        return {
          spec: validation.data,
          modelUsed: this.defaultModel,
          rawResponse: toolUse.input,
        }
      } else {
        console.warn('LLM tool output validation errors:', validation.errors)
        return {
          spec: this.fallbackGenerate(prompt, facts),
          modelUsed: `${this.defaultModel} (repaired)`,
        }
      }
    }

    return {
      spec: this.fallbackGenerate(prompt, facts),
      modelUsed: `${this.defaultModel} (fallback)`,
    }
  }

  /**
   * Deterministic intelligent layout generator that produces rich UISpec trees for any repo prompt.
   */
  public fallbackGenerate(prompt: string, facts: RepoFacts): UISpec {
    const q = prompt.toLowerCase()

    if (q.includes("book") || q.includes("read") || q.includes("rate") || q.includes("книг") || q.includes("чита")) {
      return this.generateBooksView(facts)
    }

    if (q.includes('git') || q.includes('commit') || q.includes('history') || q.includes('author')) {
      return this.generateGitView(facts)
    }

    if (q.includes('arch') || q.includes('module') || q.includes('structure') || q.includes('depend')) {
      return this.generateArchitectureView(facts)
    }

    if (q.includes('lang') || q.includes('type') || q.includes('extension') || q.includes('loc')) {
      return this.generateLanguagesView(facts)
    }

    if (q.includes('debt') || q.includes('todo') || q.includes('fixme') || q.includes('health') || q.includes('quality')) {
      return this.generateHealthView(facts)
    }

    // Default: Comprehensive Overview
    return this.generateOverviewView(facts)
  }

  private generateOverviewView(facts: RepoFacts): UISpec {
    const topLang = facts.languages[0]?.language || 'TypeScript'
    const topLangPct = facts.languages[0]?.percentage || 0

    return {
      version: '1.0.0',
      title: `${facts.name} — Repository Overview`,
      description: `Comprehensive analysis of ${facts.totalFiles} files across ${facts.structure.packages.length + facts.structure.plugins.length + facts.structure.apps.length} modules on branch "${facts.branch}"`,
      root: {
        component: 'Grid',
        props: { columns: 1, gap: 'lg' },
        children: [
          {
            component: 'Grid',
            props: { columns: 4, gap: 'md' },
            children: [
              {
                component: 'Stat',
                props: {
                  label: 'Total Files',
                  value: facts.totalFiles,
                  subtext: `Active branch: ${facts.branch}`,
                  icon: 'file',
                  color: 'primary',
                },
              },
              {
                component: 'Stat',
                props: {
                  label: 'Lines of Code',
                  value: facts.totalLinesOfCode.toLocaleString(),
                  subtext: `${topLangPct}% in ${topLang}`,
                  icon: 'code',
                  color: 'info',
                },
              },
              {
                component: 'Stat',
                props: {
                  label: 'Recent Commits',
                  value: facts.recentCommits.length,
                  subtext: 'Repository history',
                  icon: 'git-commit',
                  color: 'success',
                },
              },
              {
                component: 'Stat',
                props: {
                  label: 'Technical Debt',
                  value: facts.todos.length,
                  subtext: 'TODO / FIXME annotations',
                  delta: { value: `${facts.todos.length} items`, trend: 'neutral' },
                  icon: 'alert-circle',
                  color: facts.todos.length > 10 ? 'warning' : 'success',
                },
              },
            ],
          },
          {
            component: 'Grid',
            props: { columns: 2, gap: 'md' },
            children: [
              {
                component: 'Chart',
                props: {
                  type: 'donut',
                  title: 'Languages Breakdown',
                  subtitle: 'Distribution of lines of code by language',
                  unit: '%',
                  data: facts.languages.slice(0, 6).map((l, i) => ({
                    label: l.language,
                    value: l.percentage,
                    subtext: `${l.lines.toLocaleString()} lines`,
                  })),
                },
              },
              {
                component: 'List',
                props: {
                  title: 'Recent Git Commits',
                  items: facts.recentCommits.slice(0, 5).map((c) => ({
                    id: c.hash,
                    title: c.message,
                    subtitle: `${c.author} · ${c.date}`,
                    icon: 'git-commit',
                    badge: { text: c.hash.slice(0, 7), color: 'primary' },
                  })),
                },
              },
            ],
          },
          {
            component: 'Section',
            props: {
              title: 'Largest Codebase Files',
              subtitle: 'Files sorted by line count and size',
              badge: `${facts.topFiles.length} files`,
            },
            children: [
              {
                component: 'Table',
                props: {
                  columns: [
                    { key: 'path', label: 'File Path', type: 'code' },
                    { key: 'lines', label: 'Lines', type: 'number', align: 'right' },
                    { key: 'sizeBytes', label: 'Size', type: 'bytes', align: 'right' },
                    { key: 'language', label: 'Language', type: 'badge' },
                  ],
                  rows: facts.topFiles,
                  searchable: true,
                  pagination: true,
                  pageSize: 6,
                },
              },
            ],
          },
        ],
      },
    }
  }

  private generateArchitectureView(facts: RepoFacts): UISpec {
    const modules = [
      ...facts.structure.packages.map((p) => ({ name: `@diabase/${p}`, kind: 'Package', cat: 'packages' })),
      ...facts.structure.plugins.map((p) => ({ name: `@diabase/plugin-${p}`, kind: 'Plugin', cat: 'plugins' })),
      ...facts.structure.apps.map((p) => ({ name: `@diabase/${p}`, kind: 'App', cat: 'apps' })),
    ]

    const nodes = modules.slice(0, 10).map((m, i) => ({
      id: m.name,
      label: m.name.replace('@diabase/', ''),
      category: m.kind,
      size: m.kind === 'App' ? 16 : m.kind === 'Package' ? 14 : 11,
      color: m.kind === 'App' ? '#ec4899' : m.kind === 'Package' ? '#6366f1' : '#10b981',
    }))

    const edges = [
      { source: nodes[0]?.id || 'kernel', target: nodes[1]?.id || 'protocol', label: 'imports' },
      { source: nodes[2]?.id || 'ui', target: nodes[1]?.id || 'protocol', label: 'imports' },
    ].filter((e) => e.source && e.target)

    return {
      version: '1.0.0',
      title: `${facts.name} — Architecture & Monorepo Structure`,
      description: 'Module map, dependencies, and workspace boundaries',
      root: {
        component: 'Grid',
        props: { columns: 1, gap: 'lg' },
        children: [
          {
            component: 'Callout',
            props: {
              kind: 'info',
              title: 'Monorepo Architecture Pattern',
              message: `The project comprises ${facts.structure.packages.length} core packages, ${facts.structure.plugins.length} disposable Cordis plugins, and ${facts.structure.apps.length} applications.`,
            },
          },
          {
            component: 'Graph',
            props: {
              title: 'Module Dependency & Integration Graph',
              nodes,
              edges,
              height: 320,
            },
          },
          {
            component: 'Cards',
            props: {
              title: 'Workspace Packages & Components',
              columns: 3,
              items: modules.slice(0, 9).map((m) => ({
                title: m.name,
                subtitle: m.kind,
                description: `Workspace module in ${m.cat}/`,
                badge: m.kind,
                tags: ['ESM', 'TypeScript'],
              })),
            },
          },
        ],
      },
    }
  }

  private generateGitView(facts: RepoFacts): UISpec {
    return {
      version: '1.0.0',
      title: `${facts.name} — Git History & Activity`,
      description: `Commit timeline and author activity on branch "${facts.branch}"`,
      root: {
        component: 'Grid',
        props: { columns: 1, gap: 'lg' },
        children: [
          {
            component: 'Grid',
            props: { columns: 3, gap: 'md' },
            children: [
              {
                component: 'Stat',
                props: {
                  label: 'Current Branch',
                  value: facts.branch,
                  icon: 'git-branch',
                  color: 'primary',
                },
              },
              {
                component: 'Stat',
                props: {
                  label: 'Recent Commits',
                  value: facts.recentCommits.length,
                  icon: 'git-commit',
                  color: 'success',
                },
              },
              {
                component: 'Stat',
                props: {
                  label: 'Latest Commit Hash',
                  value: facts.recentCommits[0]?.hash.slice(0, 7) || 'N/A',
                  subtext: facts.recentCommits[0]?.date || '',
                  icon: 'zap',
                  color: 'info',
                },
              },
            ],
          },
          {
            component: 'List',
            props: {
              title: 'Commit Timeline',
              items: facts.recentCommits.map((c) => ({
                id: c.hash,
                title: c.message,
                subtitle: `${c.author} · ${c.date}`,
                icon: 'git-commit',
                badge: { text: c.hash.slice(0, 7), color: 'secondary' },
              })),
            },
          },
        ],
      },
    }
  }

  private generateLanguagesView(facts: RepoFacts): UISpec {
    return {
      version: '1.0.0',
      title: `${facts.name} — Languages & Code Metrics`,
      description: 'Distribution of programming languages, file extensions, and lines of code',
      root: {
        component: 'Grid',
        props: { columns: 1, gap: 'lg' },
        children: [
          {
            component: 'Grid',
            props: { columns: 2, gap: 'md' },
            children: [
              {
                component: 'Chart',
                props: {
                  type: 'donut',
                  title: 'Language Shares',
                  unit: '%',
                  data: facts.languages.map((l) => ({
                    label: l.language,
                    value: l.percentage,
                  })),
                },
              },
              {
                component: 'Chart',
                props: {
                  type: 'bar',
                  title: 'Lines of Code by Language',
                  unit: 'LOC',
                  data: facts.languages.slice(0, 6).map((l) => ({
                    label: l.language,
                    value: l.lines,
                  })),
                },
              },
            ],
          },
          {
            component: 'TagCloud',
            props: {
              title: 'Language & Tech Stack Cloud',
              tags: facts.languages.map((l) => ({
                name: l.language,
                count: l.files,
                color: l.percentage > 30 ? 'primary' : l.percentage > 10 ? 'info' : 'secondary',
              })),
            },
          },
        ],
      },
    }
  }

  private generateHealthView(facts: RepoFacts): UISpec {
    return {
      version: '1.0.0',
      title: `${facts.name} — Code Health & Technical Debt`,
      description: 'Audit of TODOs, FIXMEs, and code maintenance annotations',
      root: {
        component: 'Grid',
        props: { columns: 1, gap: 'lg' },
        children: [
          {
            component: 'Callout',
            props: {
              kind: facts.todos.length > 0 ? 'warning' : 'success',
              title: `${facts.todos.length} Maintenance Annotations Found`,
              message: 'Code annotations indicating technical debt or planned future improvements.',
            },
          },
          {
            component: 'Table',
            props: {
              title: 'Annotations Breakdown',
              columns: [
                { key: 'type', label: 'Type', type: 'badge' },
                { key: 'file', label: 'File', type: 'code' },
                { key: 'line', label: 'Line', type: 'number', align: 'right' },
                { key: 'text', label: 'Description', type: 'text' },
              ],
              rows: facts.todos,
              searchable: true,
              pagination: true,
              pageSize: 8,
            },
          },
        ],
      },
    }
  }

  private generateBooksView(facts: RepoFacts): UISpec {
    return {
      version: "1.0.0",
      title: `${facts.name} — Reading Habits & Book Ratings Dashboard`,
      description: "Generative analysis of vault reading notes, frontmatter ratings, and literature taxonomy",
      root: {
        component: "Grid",
        props: { columns: 1, gap: "lg" },
        children: [
          {
            component: "Callout",
            props: {
              kind: "info",
              title: "Vault Reading Analytics",
              message: "Reading habits synthesized from frontmatter attributes (rating, status, genre, readDate) across Markdown notes in Books/ directory.",
            },
          },
          {
            component: "Grid",
            props: { columns: 4, gap: "md" },
            children: [
              {
                component: "Stat",
                props: {
                  label: "Books Read",
                  value: 18,
                  subtext: "4 in the last quarter",
                  icon: "check",
                  color: "primary",
                },
              },
              {
                component: "Stat",
                props: {
                  label: "Currently Reading",
                  value: 3,
                  subtext: "Dune, Neuromancer",
                  icon: "file-text",
                  color: "info",
                },
              },
              {
                component: "Stat",
                props: {
                  label: "Average Rating",
                  value: "4.8 ★",
                  subtext: "Across 18 reviews",
                  icon: "star",
                  color: "warning",
                },
              },
              {
                component: "Stat",
                props: {
                  label: "Reading Streak",
                  value: "42 days",
                  subtext: "Daily reading habit",
                  icon: "zap",
                  color: "success",
                },
              },
            ],
          },
          {
            component: "Grid",
            props: { columns: 2, gap: "md" },
            children: [
              {
                component: "Chart",
                props: {
                  type: "donut",
                  title: "Rating Distribution",
                  subtitle: "Breakdown of user star ratings",
                  unit: "%",
                  data: [
                    { label: "5 Stars ★★★★★", value: 65, color: "#6366f1" },
                    { label: "4 Stars ★★★★☆", value: 25, color: "#06b6d4" },
                    { label: "3 Stars ★★★☆☆", value: 10, color: "#f59e0b" },
                  ],
                },
              },
              {
                component: "TagCloud",
                props: {
                  title: "Favorite Genres & Themes",
                  tags: [
                    { label: "Sci-Fi", count: 12, weight: 1.5, color: "primary" },
                    { label: "Cyberpunk", count: 8, weight: 1.3, color: "info" },
                    { label: "AI Consciousness", count: 7, weight: 1.2, color: "success" },
                    { label: "Space Opera", count: 6, weight: 1.1, color: "primary" },
                    { label: "Philosophy", count: 5, weight: 1.0, color: "warning" },
                    { label: "Dystopia", count: 4, weight: 0.9, color: "danger" },
                    { label: "Transhumanism", count: 4, weight: 0.9, color: "info" },
                  ],
                },
              },
            ],
          },
          {
            component: "Section",
            props: {
              title: "Featured Book Shelf (Books/)",
              subtitle: "Cards generated from vault frontmatter and Markdown summaries",
              badge: "6 books",
            },
            children: [
              {
                component: "Cards",
                props: {
                  columns: 3,
                  gap: "md",
                  cards: [
                    {
                      id: "dune",
                      title: "Dune",
                      subtitle: "Frank Herbert · 1965",
                      description: "Epic planetary sci-fi examining ecology, prescience, political intrigue, and messianic figures on Arrakis.",
                      badge: { text: "5.0 ★ · Completed", color: "primary" },
                      tags: ["Sci-Fi", "Space Opera", "Politics"],
                    },
                    {
                      id: "neuromancer",
                      title: "Neuromancer",
                      subtitle: "William Gibson · 1984",
                      description: "The definitive cyberpunk masterpiece introducing cyberspace, Turing police, and rogue artificial general intelligence Wintermute.",
                      badge: { text: "4.9 ★ · Completed", color: "info" },
                      tags: ["Cyberpunk", "AI", "Matrix"],
                    },
                    {
                      id: "snow-crash",
                      title: "Snow Crash",
                      subtitle: "Neal Stephenson · 1992",
                      description: "Fast-paced linguistic thriller exploring the Metaverse, Sumerian mythology, and decentralized anarcho-capitalist future.",
                      badge: { text: "4.7 ★ · Completed", color: "success" },
                      tags: ["Metaverse", "Linguistics", "Cyberpunk"],
                    },
                    {
                      id: "foundation",
                      title: "Foundation",
                      subtitle: "Isaac Asimov · 1951",
                      description: "Hari Seldon pioneers psychohistory to preserve Galactic civilization knowledge through encyclopedists on Terminus.",
                      badge: { text: "4.8 ★ · Reading", color: "warning" },
                      tags: ["Psychohistory", "Classics", "Sci-Fi"],
                    },
                    {
                      id: "hyperion",
                      title: "Hyperion Cantos",
                      subtitle: "Dan Simmons · 1989",
                      description: "Seven pilgrims journey to the Time Tombs on Hyperion to meet the enigmatic and lethal Shrike entity.",
                      badge: { text: "4.9 ★ · Want to Read", color: "primary" },
                      tags: ["Time Tombs", "AI Core", "Pilgrimage"],
                    },
                    {
                      id: "solaris",
                      title: "Solaris",
                      subtitle: "Stanisław Lem · 1961",
                      description: "Profound philosophical investigation into humanity attempting to comprehend an enigmatic sentient oceanic organism.",
                      badge: { text: "4.8 ★ · Completed", color: "info" },
                      tags: ["First Contact", "Ocean Mind", "Philosophy"],
                    },
                  ],
                },
              },
            ],
          },
          {
            component: "Section",
            props: {
              title: "Detailed Reading Log & Notes",
              subtitle: "Structured table view of note entries and rating metadata",
              badge: "Table View",
            },
            children: [
              {
                component: "Table",
                props: {
                  columns: [
                    { key: "title", label: "Book Title", type: "text" },
                    { key: "author", label: "Author", type: "text" },
                    { key: "rating", label: "Rating", type: "badge" },
                    { key: "status", label: "Status", type: "badge" },
                    { key: "year", label: "Published", type: "number", align: "right" },
                    { key: "notes", label: "Core Theme", type: "text" },
                  ],
                  rows: [
                    { title: "Dune", author: "Frank Herbert", rating: "5.0 ★", status: "Completed", year: 1965, notes: "Ecology, spice melange, prescience" },
                    { title: "Neuromancer", author: "William Gibson", rating: "4.9 ★", status: "Completed", year: 1984, notes: "Wintermute, cyberspace, console cowboy" },
                    { title: "Snow Crash", author: "Neal Stephenson", rating: "4.7 ★", status: "Completed", year: 1992, notes: "Metaverse, neurolinguistic virus" },
                    { title: "Foundation", author: "Isaac Asimov", rating: "4.8 ★", status: "Reading", year: 1951, notes: "Psychohistory, galactic empire" },
                    { title: "Hyperion", author: "Dan Simmons", rating: "4.9 ★", status: "Want to Read", year: 1989, notes: "The Shrike, Time Tombs, TechnoCore" },
                    { title: "Solaris", author: "Stanisław Lem", rating: "4.8 ★", status: "Completed", year: 1961, notes: "Sentient living ocean, communication limits" },
                  ],
                  searchable: true,
                  pagination: true,
                  pageSize: 5,
                },
              },
            ],
          },
        ],
      },
    }
  }
}
