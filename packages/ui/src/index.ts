// @diabase/ui - Ready-made React component catalog for Generative UI
import type { ComponentType } from 'react'
import type { UIComponentName } from '@diabase/protocol'

import { Stat } from './components/Stat.tsx'
import { Table } from './components/Table.tsx'
import { List } from './components/List.tsx'
import { Cards } from './components/Cards.tsx'
import { Chart } from './components/Chart.tsx'
import { TagCloud } from './components/TagCloud.tsx'
import { Graph } from './components/Graph.tsx'
import { CodeViewer } from './components/CodeViewer.tsx'
import { Markdown } from './components/Markdown.tsx'
import { Grid } from './components/Grid.tsx'
import { Section } from './components/Section.tsx'
import { Callout } from './components/Callout.tsx'
import { Badge } from './components/Badge.tsx'
import { Icon } from './icons.tsx'

export {
  Stat,
  Table,
  List,
  Cards,
  Chart,
  TagCloud,
  Graph,
  CodeViewer,
  Markdown,
  Grid,
  Section,
  Callout,
  Badge,
  Icon,
}

// Full typed map of ready-made React components indexed by UIComponentName
export const COMPONENT_REGISTRY: Record<UIComponentName, ComponentType<any>> = {
  Stat,
  Table,
  List,
  Cards,
  Chart,
  TagCloud,
  Graph,
  CodeViewer,
  Markdown,
  Grid,
  Section,
  Callout,
  Badge,
}

/** Check if a given component name is available in the registry */
export function hasComponent(name: string): name is UIComponentName {
  return name in COMPONENT_REGISTRY
}

/** Retrieve a component by name from the registry */
export function getComponent(name: UIComponentName): ComponentType<any> {
  return COMPONENT_REGISTRY[name]
}
