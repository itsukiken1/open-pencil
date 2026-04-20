// Side-channel that remembers the raw .pen source text and the pen-id →
// graph-id mapping for a given SceneGraph, so downstream tools (e.g. Kola's
// Cmd+S handler) can patch the original JSON instead of needing a full
// graph serializer.
//
// Keyed by SceneGraph instance so the data is garbage-collected alongside
// the graph.

import type { SceneGraph } from '../../../scene-graph'

export interface PenSource {
  /** Original JSON text loaded from disk. */
  text: string
  /** pen-id (as it appeared in the .pen) → scene-graph node id. */
  penToGraphId: Map<string, string>
  /** Optional absolute filesystem path, for write-back. */
  path?: string
}

const SOURCES = new WeakMap<SceneGraph, PenSource>()

export function setPenSource(graph: SceneGraph, source: PenSource): void {
  SOURCES.set(graph, source)
}

export function getPenSource(graph: SceneGraph): PenSource | undefined {
  return SOURCES.get(graph)
}

export function updatePenSourcePath(graph: SceneGraph, path: string): void {
  const existing = SOURCES.get(graph)
  if (existing) SOURCES.set(graph, { ...existing, path })
}
