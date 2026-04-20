// Phase 5: get_navigation_graph MCP tool — smoke test against a loaded
// kola.pen so downstream AI can be sure the output shape is stable.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { FigmaAPI } from '../../packages/core/src/figma-api'
import { parsePenFile } from '../../packages/core/src/io/formats/pen'
import { createConnection } from '../../packages/core/src/scene-graph/connection'
import { getNavigationGraph } from '../../packages/core/src/tools/navigation'

const KOLA_PEN = '/Users/kenitsuki/Documents/rostar/kola.pen'

describe('get_navigation_graph', () => {
  test('returns edges + screens from a loaded graph with connections', () => {
    const json = readFileSync(KOLA_PEN, 'utf-8')
    const graph = parsePenFile(json)

    // Seed 2 ad-hoc connections between real frames for the test.
    const frames = Array.from(graph.nodes.values()).filter((n) => n.type === 'FRAME')
    graph.addConnection(
      createConnection({
        id: 'nav_test_1',
        sourceNodeId: frames[0].id,
        targetNodeId: frames[1].id,
        metadata: { rostarRef: 'module_a.ControllerA.foo' }
      })
    )
    graph.addConnection(
      createConnection({
        id: 'nav_test_2',
        sourceNodeId: frames[2].id,
        targetNodeId: frames[3].id
      })
    )

    const figma = new FigmaAPI(graph)
    const result = getNavigationGraph.execute(figma, {}) as {
      screens: Array<{ id: string }>
      edges: Array<{ id: string; metadata?: { rostarRef?: string } }>
      counts: { edges: number; screens: number; orphansIncluded: boolean }
      hasPenSource: boolean
    }

    // Counts: 2 injected + any previously saved ones. Screens cover 4
    // distinct endpoints but dedup is by Set — so at least 4, unless two
    // of our test frames overlap with saved-connection endpoints.
    expect(result.counts.edges).toBeGreaterThanOrEqual(2)
    expect(result.counts.orphansIncluded).toBe(false)
    expect(result.hasPenSource).toBe(true)

    const edge1 = result.edges.find((e) => e.id === 'nav_test_1')
    expect(edge1).toBeDefined()
    expect(edge1?.metadata?.rostarRef).toBe('module_a.ControllerA.foo')
  })

  test('include_orphans returns all FRAME + COMPONENT nodes', () => {
    const json = readFileSync(KOLA_PEN, 'utf-8')
    const graph = parsePenFile(json)
    const figma = new FigmaAPI(graph)

    const withOrphans = getNavigationGraph.execute(figma, { include_orphans: true }) as {
      screens: Array<{ id: string }>
      counts: { screens: number; orphansIncluded: boolean }
    }
    const withoutOrphans = getNavigationGraph.execute(figma, {}) as {
      screens: Array<{ id: string }>
      counts: { screens: number }
    }
    expect(withOrphans.counts.orphansIncluded).toBe(true)
    expect(withOrphans.counts.screens).toBeGreaterThan(withoutOrphans.counts.screens)
  })
})
