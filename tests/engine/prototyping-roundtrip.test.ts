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
    expect(graph.connections.size).toBe(0) // clean base file

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

    // Re-parse the rewritten file
    const graph2 = parsePenFile(rewritten)
    expect(graph2.connections.size).toBe(2)

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

    graph.addConnection(
      createConnection({
        id: 'test_conn',
        sourceNodeId: anyFrame!.id,
        targetNodeId: anotherFrame!.id,
        metadata: { note: 'test' }
      })
    )

    const outbound = graph.getConnectionsFromNode(anyFrame!.id)
    expect(outbound.length).toBe(1)
    expect(outbound[0].id).toBe('test_conn')

    const inbound = graph.getConnectionsToNode(anotherFrame!.id)
    expect(inbound.length).toBe(1)

    graph.deleteConnection('test_conn')
    expect(graph.connections.size).toBe(0)
  })

  test('removeConnectionsForNode cleans edges touching a node', () => {
    const original = readFileSync(KOLA_PEN, 'utf-8')
    const graph = parsePenFile(original)
    const frames = Array.from(graph.nodes.values())
      .filter((n) => n.type === 'FRAME')
      .slice(0, 3)
    expect(frames.length).toBe(3)

    graph.addConnection(
      createConnection({
        id: 'c1',
        sourceNodeId: frames[0].id,
        targetNodeId: frames[1].id
      })
    )
    graph.addConnection(
      createConnection({
        id: 'c2',
        sourceNodeId: frames[2].id,
        targetNodeId: frames[0].id
      })
    )
    graph.addConnection(
      createConnection({
        id: 'c3',
        sourceNodeId: frames[1].id,
        targetNodeId: frames[2].id
      })
    )
    expect(graph.connections.size).toBe(3)

    graph.removeConnectionsForNode(frames[0].id)  // nukes c1 + c2
    expect(graph.connections.size).toBe(1)
    expect(graph.getConnection('c3')).toBeDefined()
  })
})
