import { describe, expect, it } from 'vitest'
import {
  COMPONENT_CATALOG,
  UIComponentName,
  UISpecSchema,
  validateUISpec,
  validateUISpecNode,
} from '../src/genui-spec.ts'

describe('GenUI Spec & Component Catalog', () => {
  it('defines the expected ready-made components', () => {
    const components = UIComponentName.options
    expect(components).toContain('Stat')
    expect(components).toContain('Table')
    expect(components).toContain('List')
    expect(components).toContain('Cards')
    expect(components).toContain('Chart')
    expect(components).toContain('TagCloud')
    expect(components).toContain('Graph')
    expect(components).toContain('CodeViewer')
    expect(components).toContain('Markdown')
    expect(components).toContain('Grid')
    expect(components).toContain('Section')
    expect(components).toContain('Callout')
    expect(components).toContain('Badge')
  })

  it('provides documentation and examples for every component in COMPONENT_CATALOG', () => {
    expect(COMPONENT_CATALOG.length).toBe(UIComponentName.options.length)
    for (const item of COMPONENT_CATALOG) {
      expect(item.description).toBeTruthy()
      expect(item.exampleProps).toBeDefined()
    }
  })

  it('validates a valid UISpec tree', () => {
    const validSpec = {
      version: '1.0.0',
      title: 'Repository Overview',
      description: 'Statistics and health of the repository',
      root: {
        component: 'Grid',
        props: { columns: 2, gap: 'md' },
        children: [
          {
            component: 'Stat',
            props: {
              label: 'Total Files',
              value: 124,
              subtext: 'across 8 modules',
              color: 'primary',
            },
          },
          {
            component: 'Chart',
            props: {
              type: 'donut',
              title: 'Languages',
              data: [
                { label: 'TypeScript', value: 85, color: '#3178c6' },
                { label: 'Markdown', value: 15, color: '#0891b2' },
              ],
            },
          },
          {
            component: 'Section',
            props: { title: 'Recent Commits', subtitle: 'Branch main' },
            children: [
              {
                component: 'List',
                props: {
                  items: [
                    { title: 'feat: add genui', subtitle: 'by team', icon: 'git-commit' },
                  ],
                },
              },
            ],
          },
        ],
      },
    }

    const result = validateUISpec(validSpec)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.data?.title).toBe('Repository Overview')
  })

  it('rejects unknown components', () => {
    const invalidSpec = {
      version: '1.0.0',
      title: 'Broken Spec',
      root: {
        component: 'NonExistentComponent',
        props: {},
      },
    }

    const result = validateUISpec(invalidSpec)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects invalid props for known components', () => {
    const invalidNode = {
      component: 'Stat',
      props: {
        // Missing required 'label' and 'value'
        color: 'primary',
      },
    }

    const result = validateUISpecNode(invalidNode)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('label'))).toBe(true)
    expect(result.errors.some((e) => e.includes('value'))).toBe(true)
  })

  it('detects nested prop validation errors with path info', () => {
    const nestedInvalid = {
      version: '1.0.0',
      title: 'Nested Test',
      root: {
        component: 'Grid',
        props: { columns: 2 },
        children: [
          {
            component: 'Chart',
            props: {
              type: 'invalid-chart-type', // invalid enum
              data: [],
            },
          },
        ],
      },
    }

    const result = validateUISpec(nestedInvalid)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('type'))).toBe(true)
  })
})
