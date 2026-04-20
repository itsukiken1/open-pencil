// MCP tool exposing the prototyping navigation graph of the current document.
//
// Designed for AI code-generation workflows (e.g. Rostar→Kola 换皮) where
// the AI needs to know which screens link to which. Output is flat and
// machine-readable.

import { getPenSource } from '../io/formats/pen'

import { defineTool } from './schema'

import type { Connection } from '../scene-graph/connection'
import type { FigmaAPI } from '../figma-api'

interface NavScreen {
  /** Graph-internal node id. */
  id: string
  /** Pen-id as it appears in the original .pen file, if known. */
  penId?: string
  name: string
  type: string
}

interface NavEdge {
  id: string
  from: string
  fromPenId?: string
  to: string
  toPenId?: string
  kind: Connection['kind']
  interaction: Connection['interaction']
  navigation?: Connection['navigation']
  url?: string
  metadata?: Connection['metadata']
}

export const getNavigationGraph = defineTool({
  name: 'get_navigation_graph',
  description:
    'Return the prototyping navigation graph: every frame/component referenced by at least one connection, plus all edges (source, target, interaction, navigation, metadata). Use this to feed AI codegen tools building navigation/router code from the design.',
  params: {
    include_orphans: {
      type: 'boolean',
      description:
        'Also include frames that have no incoming or outgoing edges. Useful for drift audits between design and routing code. Default: false.',
      required: false,
      default: false
    }
  },
  execute: (figma: FigmaAPI, args) => {
    const graph = figma.graph
    const penSource = getPenSource(graph)
    const graphIdToPenId = new Map<string, string>()
    if (penSource) {
      for (const [penId, nodeId] of penSource.penToGraphId) {
        graphIdToPenId.set(nodeId, penId)
      }
    }

    const edges: NavEdge[] = []
    const nodeIds = new Set<string>()
    for (const c of graph.connections.values()) {
      edges.push({
        id: c.id,
        from: c.sourceNodeId,
        fromPenId: graphIdToPenId.get(c.sourceNodeId),
        to: c.targetNodeId,
        toPenId: graphIdToPenId.get(c.targetNodeId),
        kind: c.kind,
        interaction: c.interaction,
        navigation: c.navigation,
        url: c.url,
        metadata: c.metadata
      })
      nodeIds.add(c.sourceNodeId)
      if (c.targetNodeId) nodeIds.add(c.targetNodeId)
    }

    const includeOrphans = args.include_orphans === true
    const screens: NavScreen[] = []
    if (includeOrphans) {
      for (const node of graph.nodes.values()) {
        if (node.type !== 'FRAME' && node.type !== 'COMPONENT') continue
        screens.push({
          id: node.id,
          penId: graphIdToPenId.get(node.id),
          name: node.name,
          type: node.type
        })
      }
    } else {
      for (const id of nodeIds) {
        const node = graph.getNode(id)
        if (!node) continue
        screens.push({
          id: node.id,
          penId: graphIdToPenId.get(node.id),
          name: node.name,
          type: node.type
        })
      }
    }

    return {
      screens,
      edges,
      hasPenSource: !!penSource,
      penPath: penSource?.path ?? null,
      counts: {
        screens: screens.length,
        edges: edges.length,
        orphansIncluded: includeOrphans
      }
    }
  }
})
