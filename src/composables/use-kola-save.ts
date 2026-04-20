// Kola-specific save shortcut (Cmd+S / Ctrl+S).
//
// When the active document was loaded from a .pen file, writePenConnections
// serializes the current graph.connections into a fresh JSON patch of the
// original .pen text and POSTs it to the Vite /__dev__/write-pen middleware,
// which writes it back to disk. Only active in dev mode.

import { onBeforeUnmount, onMounted } from 'vue'

import {
  getPenSource,
  invertPenIdMap,
  writePenConnections
} from '@open-pencil/core/io/formats/pen'

import { activeTab } from '@/stores/tabs'

const KOLA_PEN_PATH = '/Users/kenitsuki/Documents/rostar/kola.pen'

async function saveKolaConnections(): Promise<void> {
  const tab = activeTab.value
  if (!tab) return
  const graph = tab.store.graph
  const source = getPenSource(graph)
  if (!source) {
    console.warn('[kola save] no .pen source on this graph — nothing to patch')
    return
  }
  const graphIdToPenId = invertPenIdMap(source.penToGraphId)
  const newJson = writePenConnections(source.text, graph, graphIdToPenId)
  const path = source.path ?? KOLA_PEN_PATH

  try {
    const res = await fetch('/__dev__/write-pen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, text: newJson })
    })
    if (!res.ok) {
      const msg = await res.text()
      console.error('[kola save] server rejected:', res.status, msg)
      return
    }
    const body = await res.json()
    console.log(`[kola save] wrote ${body.bytes} bytes to ${path} (${graph.connections.size} connections)`)
  } catch (e) {
    console.error('[kola save] failed', e)
  }
}

export function useKolaSave(): void {
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void saveKolaConnections()
    }
  }
  onMounted(() => {
    window.addEventListener('keydown', onKey, { capture: true })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey, { capture: true })
  })
}
