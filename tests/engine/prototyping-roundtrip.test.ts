// Phase 2: verify that prototyping connections survive a .pen file round-trip.
//
// Scenario: load kola.pen → inject 2 connections via the scene-graph API →
// write them into the JSON (patch-style writer) → re-parse → verify both
// connections reappear with metadata intact.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { createConnection } from '../../packages/core/src/scene-graph/connection'
import {
  parsePenFile,
  writePenConnectionsRaw
} from '../../packages/core/src/io/formats/pen'

const KOLA_PEN = '/Users/kenitsuki/Documents/rostar/kola.pen'

describe('prototyping round-trip', () => {
  test('connections are persisted in .pen JSON and re-parsed', () => {
    const original = readFileSync(KOLA_PEN, 'utf-8')
    const graph = parsePenFile(original)
    const baseline = graph.connections.size  // may be non-zero if file was saved previously

    // Two realistic Kola connections from navigation.yaml:
    //   login → register_email  (pen ids: FOJYn → dXOYl)
    //   register_email → register_verify  (dXOYl → M2uMI)
    const conns = [
      {
        id: 'conn_login_signup',
        sourceNodeId: 'FOJYn',
        targetNodeId: 'dXOYl',
        kind: 'INTERNAL_NODE',
        interaction: 'ON_CLICK',
        navigation: 'NAVIGATE',
        metadata: {
          rostarRef: 'module_login.LoginPage.onSignUpTap',
          triggerSemantic: 'onTap',
          note: '登录页 Sign up 链接跳邮箱注册'
        }
      },
      {
        id: 'conn_send_code',
        sourceNodeId: 'dXOYl',
        targetNodeId: 'M2uMI',
        kind: 'INTERNAL_NODE',
        interaction: 'ON_CLICK',
        navigation: 'NAVIGATE',
        metadata: {
          rostarRef: 'module_auth.AuthRepository.sendRegisterCode',
          triggerSemantic: 'onApiSuccess(sendRegisterCode)'
        }
      }
    ]

    const rewritten = writePenConnectionsRaw(original, conns)

    // Re-parse the rewritten file — previous prototyping array was replaced
    // so only the 2 injected connections remain.
    const graph2 = parsePenFile(rewritten)
    expect(graph2.connections.size).toBe(2)
    void baseline  // acknowledged but not asserted on — documents intent

    const a = graph2.getConnection('conn_login_signup')
    expect(a).toBeDefined()
    expect(a?.kind).toBe('INTERNAL_NODE')
    expect(a?.interaction).toBe('ON_CLICK')
    expect(a?.metadata?.rostarRef).toBe('module_login.LoginPage.onSignUpTap')
    // sourceNodeId should be the scene-graph id, NOT 'FOJYn'.
    // But the connection should still point to a real node.
    expect(a?.sourceNodeId).toBeDefined()
    expect(a?.sourceNodeId?.length).toBeGreaterThan(0)
    expect(graph2.nodes.has(a!.sourceNodeId)).toBe(true)
    expect(graph2.nodes.has(a!.targetNodeId)).toBe(true)

    const b = graph2.getConnection('conn_send_code')
    expect(b?.metadata?.rostarRef).toBe(
      'module_auth.AuthRepository.sendRegisterCode'
    )
  })

  test('getConnectionsFromNode returns outbound edges', () => {
    const original = readFileSync(KOLA_PEN, 'utf-8')
    const graph = parsePenFile(original)

    // Grab a real pen-node id to test against. Since SceneGraph rewrites ids,
    // we just attach a connection manually.
    const anyFrame = Array.from(graph.nodes.values()).find(
      (n) => n.type === 'FRAME'
    )
    expect(anyFrame).toBeDefined()
    const anotherFrame = Array.from(graph.nodes.values()).find(
      (n) => n.type === 'FRAME' && n.id !== anyFrame!.id
    )
    expect(anotherFrame).toBeDefined()

    const baseOutFrom = graph.getConnectionsFromNode(anyFrame!.id).length
    const baseInTo = graph.getConnectionsToNode(anotherFrame!.id).length
    const baseSize = graph.connections.size

    graph.addConnection(
      createConnection({
        id: 'test_conn',
        sourceNodeId: anyFrame!.id,
        targetNodeId: anotherFrame!.id,
        metadata: { note: 'test' }
      })
    )

    const outbound = graph.getConnectionsFromNode(anyFrame!.id)
    expect(outbound.length).toBe(baseOutFrom + 1)
    expect(outbound.some((c) => c.id === 'test_conn')).toBe(true)

    const inbound = graph.getConnectionsToNode(anotherFrame!.id)
    expect(inbound.length).toBe(baseInTo + 1)

    graph.deleteConnection('test_conn')
    expect(graph.connections.size).toBe(baseSize)
  })

  test('removeConnectionsForNode cleans edges touching a node', () => {
    const original = readFileSync(KOLA_PEN, 'utf-8')
    const graph = parsePenFile(original)
    const frames = Array.from(graph.nodes.values())
      .filter((n) => n.type === 'FRAME')
      .slice(0, 3)
    expect(frames.length).toBe(3)
    const baseSize = graph.connections.size

    graph.addConnection(
      createConnection({ id: 'c1', sourceNodeId: frames[0].id, targetNodeId: frames[1].id })
    )
    graph.addConnection(
      createConnection({ id: 'c2', sourceNodeId: frames[2].id, targetNodeId: frames[0].id })
    )
    graph.addConnection(
      createConnection({ id: 'c3', sourceNodeId: frames[1].id, targetNodeId: frames[2].id })
    )
    expect(graph.connections.size).toBe(baseSize + 3)

    graph.removeConnectionsForNode(frames[0].id)  // nukes c1 + c2
    expect(graph.getConnection('c1')).toBeUndefined()
    expect(graph.getConnection('c2')).toBeUndefined()
    expect(graph.getConnection('c3')).toBeDefined()
  })
})
