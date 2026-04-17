// Minimal .pen writer — patch-style.
//
// open-pencil does not yet have a full SceneGraph → .pen serializer.
// For the prototyping workflow we only need to persist `doc.prototyping`
// (the connection list). Everything else in the .pen file is left byte-identical
// by reading the original JSON, mutating just the prototyping field, and
// writing it back.
//
// Round-trip guarantee: for files not touched by the editor's tree editing
// operations, `parse(read(write(x))).children === x.children` (structurally).

import type { Connection } from '../../../scene-graph/connection'
import type { SceneGraph } from '../../../scene-graph'
import type { PenConnection, PenDocument } from './convert'

/**
 * Given the original .pen JSON string and the current graph's connections,
 * return a new JSON string that contains an updated `prototyping` field.
 *
 * The source/target node ids in `graph.connections` are SceneGraph-internal
 * ids. To write them back the caller must supply the pen-id mapping that was
 * built during import (`VarContext.penToGraphIds` inverted).
 */
export function writePenConnections(
  originalJson: string,
  graph: SceneGraph,
  graphIdToPenId: Map<string, string>
): string {
  const doc = JSON.parse(originalJson) as PenDocument

  const penConnections: PenConnection[] = []
  for (const conn of graph.connections.values()) {
    const sourcePenId = graphIdToPenId.get(conn.sourceNodeId)
    if (!sourcePenId) continue
    const targetPenId = conn.targetNodeId
      ? (graphIdToPenId.get(conn.targetNodeId) ?? '')
      : ''
    penConnections.push({
      id: conn.id,
      sourceNodeId: sourcePenId,
      targetNodeId: targetPenId,
      kind: conn.kind,
      interaction: conn.interaction,
      navigation: conn.navigation,
      url: conn.url,
      metadata: conn.metadata as Record<string, unknown> | undefined
    })
  }

  doc.prototyping = penConnections
  // Preserve 2-space indentation consistent with existing .pen files.
  return JSON.stringify(doc, null, 2)
}

/**
 * Standalone helper when the caller already has a fresh connection list and
 * just wants to splice it into a .pen JSON without involving SceneGraph.
 * Useful for AI/MCP tools that write directly.
 */
export function writePenConnectionsRaw(
  originalJson: string,
  connections: PenConnection[]
): string {
  const doc = JSON.parse(originalJson) as PenDocument
  doc.prototyping = connections
  return JSON.stringify(doc, null, 2)
}

/** Invert the penToGraphIds map captured during parsePenFile. */
export function invertPenIdMap(
  penToGraph: Map<string, string>
): Map<string, string> {
  const out = new Map<string, string>()
  for (const [pen, g] of penToGraph) out.set(g, pen)
  return out
}

export type { Connection, PenConnection }
