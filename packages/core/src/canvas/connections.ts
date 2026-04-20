// Phase 3 MVP — render prototyping connections as bezier arrows.
//
// For each Connection in graph.connections we:
//   1. Resolve source + target absolute bounds via SceneGraph
//   2. Pick anchor points on the nearest edges of each bounding box
//   3. Draw a smooth cubic bezier arrow with filled endpoint handles
//
// This runs inside the world-transform context (scale/pan/zoom) so everything
// is expressed in world coordinates. Handle sizes are world-pixel based —
// they grow/shrink with zoom, which matches Figma's prototyping behaviour.

import type { Canvas, Paint } from 'canvaskit-wasm'

import type { SceneGraph } from '../scene-graph'
import type { Connection } from '../scene-graph/connection'

import type { SkiaRenderer } from './renderer'

export const HANDLE_RADIUS = 5
/** Pixel-radius around either endpoint that counts as a hit for delete-on-click. */
export const HANDLE_HIT_RADIUS = 9
const ARROW_HEAD_LEN = 12
const ARROW_HEAD_WIDTH = 9
const STROKE_WIDTH = 2

/** Colour palette for prototyping arrows — brand purple, matches Figma. */
const ARROW_R = 0.6
const ARROW_G = 0.23
const ARROW_B = 0.94

export interface Anchor {
  x: number
  y: number
  dx: number  // tangent vector, magnitude 1
  dy: number
}

/**
 * Compute the source and target anchor points for an existing connection.
 * Returns null if either node is missing. Used by editor input handlers for
 * hit-testing handles (e.g. click-to-delete).
 */
export function getConnectionAnchors(
  graph: SceneGraph,
  conn: Connection
): { source: Anchor; target: Anchor } | null {
  const source = rectOf(graph, conn.sourceNodeId)
  if (!source) return null
  if (conn.kind !== 'INTERNAL_NODE') {
    // Stub arrow — target is 40px to the right of source right-edge.
    const x = source.x + source.w
    const y = source.y + source.h / 2
    return {
      source: { x, y, dx: 1, dy: 0 },
      target: { x: x + 40, y, dx: 1, dy: 0 }
    }
  }
  const target = rectOf(graph, conn.targetNodeId)
  if (!target) return null
  return { source: pickAnchor(source, target), target: pickAnchor(target, source) }
}

function cubicAt(
  a: Anchor,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  b: Anchor,
  t: number
): { x: number; y: number } {
  const u = 1 - t
  const x = u * u * u * a.x + 3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t * b.x
  const y = u * u * u * a.y + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * b.y
  return { x, y }
}

/**
 * Squared distance from (px, py) to the nearest point on the connection's
 * rendered cubic bezier. Samples 24 points along the curve — good enough
 * for hit-testing given the curves are reasonably smooth. Returns
 * Infinity if the connection's source or target can't be resolved.
 */
export function connectionDistSq(
  graph: SceneGraph,
  conn: Connection,
  px: number,
  py: number
): number {
  const anchors = getConnectionAnchors(graph, conn)
  if (!anchors) return Infinity
  const { source: a, target: b } = anchors
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  const bow = Math.max(40, dist * 0.35)
  const cp1x = a.x + a.dx * bow
  const cp1y = a.y + a.dy * bow
  const cp2x = b.x + b.dx * bow
  const cp2y = b.y + b.dy * bow

  let min = Infinity
  const STEPS = 24
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const p = cubicAt(a, cp1x, cp1y, cp2x, cp2y, b, t)
    const dx = px - p.x
    const dy = py - p.y
    const d2 = dx * dx + dy * dy
    if (d2 < min) min = d2
  }
  return min
}

/** Pick the anchor on `bounds` closest to the opposite side of `other`. */
function pickAnchor(
  bounds: { x: number; y: number; w: number; h: number },
  other: { x: number; y: number; w: number; h: number }
): Anchor {
  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  const ox = other.x + other.w / 2
  const oy = other.y + other.h / 2
  const dx = ox - cx
  const dy = oy - cy
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { x: bounds.x + bounds.w, y: cy, dx: 1, dy: 0 }
    }
    return { x: bounds.x, y: cy, dx: -1, dy: 0 }
  }
  if (dy >= 0) {
    return { x: cx, y: bounds.y + bounds.h, dx: 0, dy: 1 }
  }
  return { x: cx, y: bounds.y, dx: 0, dy: -1 }
}

function rectOf(graph: SceneGraph, nodeId: string):
  | { x: number; y: number; w: number; h: number }
  | null {
  const node = graph.getNode(nodeId)
  if (!node) return null
  const bounds = graph.getAbsoluteBounds(nodeId)
  return { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height }
}

export function drawConnections(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  pending: { sourceNodeId: string; cursorX: number; cursorY: number } | null = null,
  selectedConnectionId: string | null = null
): void {
  if (graph.connections.size === 0 && !pending) return

  const paints = ensurePaints(r)

  for (const conn of graph.connections.values()) {
    const isSelected = conn.id === selectedConnectionId
    if (isSelected) {
      // Draw a fatter halo behind the selected arrow so it reads as focused.
      drawOneConnection(r, canvas, graph, conn, paints.selectionHalo, paints.handle)
    }
    drawOneConnection(r, canvas, graph, conn, paints.stroke, paints.handle)
  }

  if (pending) drawPendingConnection(r, canvas, graph, pending, paints.stroke, paints.handle)
}

function drawPendingConnection(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  pending: { sourceNodeId: string; cursorX: number; cursorY: number },
  stroke: Paint,
  handle: Paint
): void {
  const source = rectOf(graph, pending.sourceNodeId)
  if (!source) return
  const cursor = { x: pending.cursorX, y: pending.cursorY, w: 0, h: 0 }
  const a = pickAnchor(source, cursor)

  const b: Anchor = {
    x: pending.cursorX,
    y: pending.cursorY,
    dx: 0,
    dy: 0
  }

  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  const bow = Math.max(40, dist * 0.35)
  const cp1x = a.x + a.dx * bow
  const cp1y = a.y + a.dy * bow

  const path = new r.ck.Path()
  path.moveTo(a.x, a.y)
  path.cubicTo(cp1x, cp1y, b.x, b.y, b.x, b.y)
  canvas.drawPath(path, stroke)
  path.delete()

  canvas.drawCircle(a.x, a.y, HANDLE_RADIUS, handle)
  canvas.drawCircle(b.x, b.y, HANDLE_RADIUS, handle)
}

function drawOneConnection(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  conn: Connection,
  strokePaint: Paint,
  handlePaint: Paint
): void {
  const source = rectOf(graph, conn.sourceNodeId)
  if (!source) return

  if (conn.kind !== 'INTERNAL_NODE') {
    // For URL/BACK/CLOSE, anchor floats right of the source and points nowhere
    // specific. Draw a small outgoing nub so users see the edge exists.
    drawStubArrow(r, canvas, source, strokePaint, handlePaint)
    return
  }

  const target = rectOf(graph, conn.targetNodeId)
  if (!target) return

  const a = pickAnchor(source, target)
  const b = pickAnchor(target, source)

  // Control points: push out along the anchor tangent by a fraction of the
  // linear distance. Produces a smooth S-curve that feels like Figma.
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  const bow = Math.max(40, dist * 0.35)
  const cp1x = a.x + a.dx * bow
  const cp1y = a.y + a.dy * bow
  const cp2x = b.x + b.dx * bow
  const cp2y = b.y + b.dy * bow

  const path = new r.ck.Path()
  path.moveTo(a.x, a.y)
  path.cubicTo(cp1x, cp1y, cp2x, cp2y, b.x, b.y)
  canvas.drawPath(path, strokePaint)
  path.delete()

  // Source handle: filled disk
  canvas.drawCircle(a.x, a.y, HANDLE_RADIUS, handlePaint)

  // Arrowhead at target: triangle pointing into b along -b.dx,-b.dy
  drawArrowhead(r, canvas, b, handlePaint)
}

function drawArrowhead(
  r: SkiaRenderer,
  canvas: Canvas,
  b: Anchor,
  fill: Paint
): void {
  // b.dx/b.dy is outward from target, so incoming direction is the negation
  const ix = -b.dx
  const iy = -b.dy
  // Perpendicular (rotate 90°)
  const px = -iy
  const py = ix

  const tipX = b.x
  const tipY = b.y
  const baseCX = b.x - ix * ARROW_HEAD_LEN
  const baseCY = b.y - iy * ARROW_HEAD_LEN
  const leftX = baseCX + px * (ARROW_HEAD_WIDTH / 2)
  const leftY = baseCY + py * (ARROW_HEAD_WIDTH / 2)
  const rightX = baseCX - px * (ARROW_HEAD_WIDTH / 2)
  const rightY = baseCY - py * (ARROW_HEAD_WIDTH / 2)

  const head = new r.ck.Path()
  head.moveTo(tipX, tipY)
  head.lineTo(leftX, leftY)
  head.lineTo(rightX, rightY)
  head.close()
  canvas.drawPath(head, fill)
  head.delete()
}

function drawStubArrow(
  r: SkiaRenderer,
  canvas: Canvas,
  source: { x: number; y: number; w: number; h: number },
  stroke: Paint,
  fill: Paint
): void {
  const x = source.x + source.w
  const y = source.y + source.h / 2
  const stubLen = 40
  const path = new r.ck.Path()
  path.moveTo(x, y)
  path.lineTo(x + stubLen, y)
  canvas.drawPath(path, stroke)
  path.delete()
  canvas.drawCircle(x, y, HANDLE_RADIUS, fill)
  drawArrowhead(
    r,
    canvas,
    { x: x + stubLen, y, dx: 1, dy: 0 },
    fill
  )
}

/**
 * Lazily construct the connection paints on first use. Renderer consumers
 * just import drawConnections; they don't need to plumb paint setup.
 */
function ensurePaints(r: SkiaRenderer): {
  stroke: Paint
  handle: Paint
  selectionHalo: Paint
} {
  if (r.connectionPaint && r.connectionHandlePaint && r.connectionSelectionPaint) {
    return {
      stroke: r.connectionPaint,
      handle: r.connectionHandlePaint,
      selectionHalo: r.connectionSelectionPaint
    }
  }
  const stroke = new r.ck.Paint()
  stroke.setStyle(r.ck.PaintStyle.Stroke)
  stroke.setStrokeWidth(STROKE_WIDTH)
  stroke.setColor(r.ck.Color4f(ARROW_R, ARROW_G, ARROW_B, 1))
  stroke.setAntiAlias(true)

  const handle = new r.ck.Paint()
  handle.setStyle(r.ck.PaintStyle.Fill)
  handle.setColor(r.ck.Color4f(ARROW_R, ARROW_G, ARROW_B, 1))
  handle.setAntiAlias(true)

  // Wider, translucent halo drawn under the selected arrow.
  const selectionHalo = new r.ck.Paint()
  selectionHalo.setStyle(r.ck.PaintStyle.Stroke)
  selectionHalo.setStrokeWidth(STROKE_WIDTH + 6)
  selectionHalo.setColor(r.ck.Color4f(ARROW_R, ARROW_G, ARROW_B, 0.3))
  selectionHalo.setAntiAlias(true)

  r.connectionPaint = stroke
  r.connectionHandlePaint = handle
  r.connectionSelectionPaint = selectionHalo
  return { stroke, handle, selectionHalo }
}
