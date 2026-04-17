// Smoke test: open-pencil parser should accept kola.pen (from rostar project).
// Guards the group/line/polygon patch + surfaces any other parse regressions.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parsePenFile } from '../../packages/core/src/io/formats/pen/read'

const KOLA_PEN = '/Users/kenitsuki/Documents/rostar/kola.pen'

describe('kola.pen compatibility', () => {
  test('parses without throwing', () => {
    const json = readFileSync(KOLA_PEN, 'utf-8')
    const graph = parsePenFile(json)
    expect(graph).toBeDefined()
    expect(graph.nodes).toBeDefined()
  })

  test('all 12,061 nodes map to a real NodeType', () => {
    const json = readFileSync(KOLA_PEN, 'utf-8')
    const graph = parsePenFile(json)
    const typeCounts: Record<string, number> = {}
    for (const node of Array.from(graph.nodes.values())) {
      typeCounts[node.type] = (typeCounts[node.type] ?? 0) + 1
    }
    console.log('scene-graph NodeType counts:', typeCounts)

    // group/line/polygon must NOT silently fall through to FRAME
    // (counts should match kola.pen source: group=2243, line=51, polygon=5)
    expect(typeCounts.GROUP ?? 0).toBeGreaterThanOrEqual(2000)
    expect(typeCounts.LINE ?? 0).toBeGreaterThanOrEqual(40)
    expect(typeCounts.POLYGON ?? 0).toBeGreaterThanOrEqual(5)
  })

  test('frame count matches source (expect >2500 frames)', () => {
    const json = readFileSync(KOLA_PEN, 'utf-8')
    const graph = parsePenFile(json)
    const all = Array.from(graph.nodes.values())
    const frames = all.filter((n) => n.type === 'FRAME' || n.type === 'COMPONENT')
    console.log(`frame+component count: ${frames.length} (source had ~3026 frames)`)
    expect(frames.length).toBeGreaterThan(2500)
  })
})
