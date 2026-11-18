<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, ExternalLink } from '@lucide/vue'

const props = defineProps<{ problemId: string; theme: 'light' | 'dark'; initialXml: string; busy: boolean }>()
const emit = defineEmits<{ ready: [xml: string]; snapshot: [xml: string]; failure: [message: string] }>()
const origin = 'https://embed.diagrams.net'
const frame = ref<HTMLIFrameElement | null>(null)
const ready = ref(false)
const slow = ref(false)
const storageOk = ref(true)
const hasDownloaded = ref(false)
const status = ref('正在连接画布…')
const key = computed(() => `uml-oj-drawio-main-v2:${props.problemId}`)
const url = computed(() => `${origin}/?embed=1&proto=json&spin=1&libraries=1&libs=uml&lang=zh&ui=min&dark=${props.theme === 'dark' ? '1' : '0'}&noSaveBtn=1&noExitBtn=1&saveAndExit=0`)
let currentXml = ''
let downloadedXml: string | null = null
let confirmedBackupXml: string | null = null
let requestId = 0
let queue: Promise<unknown> = Promise.resolve()
let pendingExport: { id: number; resolve: (xml: string | null) => void; timeout: ReturnType<typeof setTimeout> } | null = null
let pendingLoad: { resolve: (ok: boolean) => void; timeout: ReturnType<typeof setTimeout> } | null = null
let debounce: ReturnType<typeof setTimeout> | undefined
let slowTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false

function post(value: object) { frame.value?.contentWindow?.postMessage(JSON.stringify(value), origin) }
function save(xml: string): boolean {
  currentXml = xml
  try {
    localStorage.setItem(key.value, xml)
    storageOk.value = true
    status.value = '画布草稿已保存到当前浏览器'
    return true
  } catch {
    storageOk.value = false
    status.value = '画布草稿无法保存，请下载 .drawio 备份。'
    emit('failure', status.value)
    return false
  }
}
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task)
  queue = next.catch(() => undefined)
  return next
}
function requestExport(commitEdit = false): Promise<string | null> {
  if (!ready.value || disposed) return Promise.resolve(null)
  return new Promise(resolve => {
    const id = ++requestId
    const timeout = setTimeout(() => {
      if (pendingExport?.id !== id) return
      pendingExport = null
      status.value = '无法获取当前画布，已暂停同步。'
      emit('failure', status.value)
      resolve(null)
    }, 8000)
    pendingExport = { id, resolve, timeout }
    // Official resetEditor commits an in-place label edit before export. Without
    // this, switching focus to the host can export and judge the old label.
    if (commitEdit) post({ action: 'resetEditor' })
    post({ action: 'export', format: 'xml', umlOjRequestId: id })
  })
}
function requestLoad(xml: string): Promise<boolean> {
  if (!ready.value || disposed) return Promise.resolve(false)
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (!pendingLoad) return
      pendingLoad = null
      status.value = '画布更新未确认，已暂停同步。'
      emit('failure', status.value)
      resolve(false)
    }, 8000)
    pendingLoad = { resolve, timeout }
    post({ action: 'load', xml, autosave: 1, noSaveBtn: 1, noExitBtn: 1, saveAndExit: 0 })
  })
}
function flush(commitEdit = true): Promise<string | null> {
  return enqueue(async () => {
    const xml = await requestExport(commitEdit)
    return xml && (save(xml) || xml === confirmedBackupXml) ? xml : null
  })
}
function applyXml(xml: string): Promise<string | null> {
  return enqueue(async () => {
    // Persist the previous snapshot first; a failed load must never destroy it.
    if (!currentXml || !save(currentXml)) return null
    if (!(await requestLoad(xml))) return null
    const actual = await requestExport()
    return actual && save(actual) ? actual : null
  })
}
function handleMessage(event: MessageEvent) {
  if (event.origin !== origin || event.source !== frame.value?.contentWindow || typeof event.data !== 'string') return
  let data: any
  try { data = JSON.parse(event.data) } catch { return }
  if (!data || typeof data !== 'object') return
  if (data.event === 'init') {
    post({ action: 'load', xml: currentXml, autosave: 1, noSaveBtn: 1, noExitBtn: 1, saveAndExit: 0, fit: 1, maxFitScale: 1 })
  } else if (data.event === 'load') {
    if (pendingLoad) {
      const request = pendingLoad; pendingLoad = null; clearTimeout(request.timeout)
      request.resolve(!data.error)
    } else if (!ready.value) {
      if (data.error) { status.value = '画布加载失败，原始草稿未被覆盖。'; slow.value = true; emit('failure', status.value); return }
      ready.value = true
      slow.value = false
      status.value = storageOk.value ? '画布已连接' : '画布草稿无法保存，请下载 .drawio 备份。'
      emit('ready', currentXml)
    }
  } else if (data.event === 'export' && pendingExport && data.message?.umlOjRequestId === pendingExport.id) {
    const request = pendingExport; pendingExport = null; clearTimeout(request.timeout)
    if (data.format === 'xml' && typeof data.xml === 'string' && data.xml.trim()) request.resolve(data.xml)
    else {
      status.value = '无法获取当前画布快照，已暂停同步。'
      emit('failure', status.value)
      request.resolve(null)
    }
  } else if (data.event === 'autosave' || data.event === 'save') {
    // Treat autosave as a notification, not as a reliable ordering token. Ask
    // for a fresh snapshot so a delayed autosave cannot restore stale content.
    clearTimeout(debounce)
    debounce = setTimeout(async () => {
      if (props.busy || !ready.value) return
      const xml = await flush(false)
      if (xml && !props.busy && !disposed) emit('snapshot', xml)
    }, 300)
  }
}
function exportCurrent(): Promise<string | null> {
  return enqueue(async () => ready.value ? await requestExport(true) : currentXml || null)
}
async function download() {
  const xml = await exportCurrent()
  if (!xml) { status.value = '无法获取可下载的画布内容。'; return }
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `uml-oj-${props.problemId}.drawio`; link.click()
  downloadedXml = xml
  hasDownloaded.value = true
  if (!storageOk.value) status.value = '已发起下载，请确认文件已保存后再确认备份。'
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function confirmBackup() {
  if (downloadedXml && window.confirm('请先确认 .drawio 文件已成功保存。画布再次修改后需重新下载备份。')) {
    confirmedBackupXml = downloadedXml
    status.value = '备份已确认；离开时仍会核对画布是否变化。'
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!ready.value) return
  event.preventDefault(); event.returnValue = ''
}
onMounted(() => {
  try { currentXml = localStorage.getItem(key.value) ?? props.initialXml }
  catch { currentXml = props.initialXml; storageOk.value = false; status.value = '画布草稿无法读取或保存。'; emit('failure', status.value) }
  window.addEventListener('message', handleMessage)
  window.addEventListener('beforeunload', beforeUnload)
  slowTimer = setTimeout(() => { if (!ready.value) slow.value = true }, 10000)
})
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(debounce); clearTimeout(slowTimer)
  window.removeEventListener('message', handleMessage); window.removeEventListener('beforeunload', beforeUnload)
  if (pendingExport) { clearTimeout(pendingExport.timeout); pendingExport.resolve(null); pendingExport = null }
  if (pendingLoad) { clearTimeout(pendingLoad.timeout); pendingLoad.resolve(false); pendingLoad = null }
})
defineExpose({ flush, applyXml, download, exportCurrent, isReady: () => ready.value })
</script>

<template>
  <div class="drawio-trial formal-drawio">
    <div class="drawio-notice" role="status"><span>推荐从左侧 UML 拖入 Class；简单矩形和椭圆也按类处理，需填写类名。属性和方法请使用 UML 类形状。</span><button class="drawio-download" @click="download"><Download :size="14" />下载 .drawio</button><button v-if="!storageOk && hasDownloaded" class="drawio-download" @click="confirmBackup">确认已保存备份</button></div>
    <div class="drawio-frame-wrap" :class="{ 'is-busy': busy }">
      <iframe ref="frame" :src="url" :inert="!ready || busy" title="draw.io 类图画布" referrerpolicy="no-referrer" allow="clipboard-read; clipboard-write"></iframe>
      <div v-if="!ready" class="drawio-loading" role="status"><template v-if="slow"><strong>draw.io 暂未连接</strong><p>画布需要访问 embed.diagrams.net，请检查网络。原有草稿不会被覆盖。</p><a href="https://www.drawio.com/" target="_blank" rel="noopener noreferrer">了解 draw.io <ExternalLink :size="14" /></a></template><span v-else>正在连接 draw.io…</span></div>
    </div>
    <div class="drawio-status" :class="{ 'drawio-error': !storageOk }" role="status">{{ status }}</div>
  </div>
</template>
