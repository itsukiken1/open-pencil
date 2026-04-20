<script setup lang="ts">
import { computed } from 'vue'

import { useEditorStore } from '@/stores/editor'

const store = useEditorStore()

const selectedConn = computed(() => {
  const sid = store.state.selectedConnectionId
  if (!sid) return null
  return store.graph.getConnection(sid) ?? null
})

function updateMeta(key: 'rostarRef' | 'note' | 'triggerSemantic', value: string) {
  const c = selectedConn.value
  if (!c) return
  const trimmed = value.trim()
  const nextMeta = { ...(c.metadata ?? {}) }
  if (trimmed === '') delete nextMeta[key]
  else nextMeta[key] = trimmed
  store.graph.updateConnection(c.id, { metadata: nextMeta })
  store.requestRender()
}

function updateInteraction(value: string) {
  const c = selectedConn.value
  if (!c) return
  store.graph.updateConnection(c.id, {
    interaction: value as typeof c.interaction
  })
  store.requestRender()
}

function deleteConnection() {
  const c = selectedConn.value
  if (!c) return
  store.graph.deleteConnection(c.id)
  store.state.selectedConnectionId = null
  store.requestRender()
}

function deselect() {
  store.state.selectedConnectionId = null
  store.requestRender()
}
</script>

<template>
  <div
    v-if="selectedConn"
    class="border-b border-border bg-panel p-3 text-xs"
    data-test-id="connection-metadata-panel"
  >
    <div class="mb-2 flex items-center justify-between">
      <span class="font-semibold text-surface">Connection</span>
      <button
        class="text-muted hover:text-surface"
        title="Deselect"
        @click="deselect"
      >
        <icon-lucide-x class="size-3.5" />
      </button>
    </div>

    <div class="mb-2 text-muted">
      <div>id: <code class="text-surface">{{ selectedConn.id }}</code></div>
      <div>from: <code class="text-surface">{{ selectedConn.sourceNodeId }}</code></div>
      <div>to: <code class="text-surface">{{ selectedConn.targetNodeId }}</code></div>
    </div>

    <label class="mb-2 block">
      <span class="mb-0.5 block text-muted">Interaction</span>
      <select
        class="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs"
        :value="selectedConn.interaction"
        @change="updateInteraction(($event.target as HTMLSelectElement).value)"
      >
        <option value="ON_CLICK">ON_CLICK</option>
        <option value="ON_HOVER">ON_HOVER</option>
        <option value="ON_PRESS">ON_PRESS</option>
        <option value="MOUSE_IN">MOUSE_IN</option>
        <option value="MOUSE_OUT">MOUSE_OUT</option>
        <option value="MOUSE_DOWN">MOUSE_DOWN</option>
        <option value="MOUSE_UP">MOUSE_UP</option>
        <option value="AFTER_TIMEOUT">AFTER_TIMEOUT</option>
      </select>
    </label>

    <label class="mb-2 block">
      <span class="mb-0.5 block text-muted">Rostar ref</span>
      <input
        type="text"
        placeholder="module_x.ControllerY.methodZ"
        class="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs"
        :value="selectedConn.metadata?.rostarRef ?? ''"
        @input="updateMeta('rostarRef', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="mb-2 block">
      <span class="mb-0.5 block text-muted">Trigger semantic</span>
      <input
        type="text"
        placeholder="onTap / onSubmit / onApiSuccess(foo)"
        class="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs"
        :value="selectedConn.metadata?.triggerSemantic ?? ''"
        @input="updateMeta('triggerSemantic', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="mb-3 block">
      <span class="mb-0.5 block text-muted">Note</span>
      <input
        type="text"
        placeholder="human description"
        class="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs"
        :value="selectedConn.metadata?.note ?? ''"
        @input="updateMeta('note', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <button
      class="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-destructive hover:bg-destructive hover:text-surface"
      @click="deleteConnection"
    >
      Delete connection (or press Backspace)
    </button>
    <div class="mt-2 text-[10px] text-muted">
      Tip: Cmd+S writes rostarRef + all edits back to .pen
    </div>
  </div>
</template>
