// Async image loader for .pen files.
//
// Kola-style .pen files carry `fill.type === 'image'` with a relative URL
// like "images/image-import-12.png". parsePenFile is synchronous and only
// stashes the URL on fill.imageHash. This module fetches the actual bytes
// after parse and populates graph.images keyed by the same URL string.
//
// The url-to-http resolver is caller-provided so the loader works in both
// browser (HTTP fetch) and node (fs read) contexts.

import type { SceneGraph } from '../../../scene-graph'

/** Collect every unique imageHash value across all nodes' fills. */
function collectImageUrls(graph: SceneGraph): string[] {
  const seen = new Set<string>()
  for (const node of graph.nodes.values()) {
    for (const fill of node.fills ?? []) {
      if (fill.type === 'IMAGE' && fill.imageHash && !graph.images.has(fill.imageHash)) {
        seen.add(fill.imageHash)
      }
    }
  }
  return Array.from(seen)
}

/**
 * Fetch every image referenced by the graph and populate graph.images.
 * Returns the count of successfully loaded images.
 */
export async function loadPenImages(
  graph: SceneGraph,
  resolveUrl: (url: string) => string,
  fetchImpl: (url: string) => Promise<ArrayBuffer> = defaultFetch
): Promise<{ loaded: number; failed: number }> {
  const urls = collectImageUrls(graph)
  if (urls.length === 0) return { loaded: 0, failed: 0 }

  let loaded = 0
  let failed = 0
  // Parallel fetch, cap concurrency to avoid overwhelming the dev server.
  const CONCURRENCY = 8
  let i = 0
  async function worker(): Promise<void> {
    while (i < urls.length) {
      const idx = i++
      const url = urls[idx]
      try {
        const bytes = await fetchImpl(resolveUrl(url))
        graph.images.set(url, new Uint8Array(bytes))
        loaded++
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  return { loaded, failed }
}

async function defaultFetch(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
  return res.arrayBuffer()
}
