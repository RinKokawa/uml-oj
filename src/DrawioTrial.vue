<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, ExternalLink } from '@lucide/vue'

// The trial deliberately stores draw.io's native XML independently of the
// existing Apollon/source drafts. Never interpret or overwrite those drafts.
const props = defineProps<{ problemId: string; theme: 'light' | 'dark'; busy: boolean }>()
const frame = ref<HTMLIFrameElement | null>(null)
const ready = ref(false)
const loadingSlow = ref(false)
const status = ref('正在连接 draw.io…')
const storageOk = ref(true)
const hasDownloaded = ref(false)
const storageKey = computed(() => `uml-oj-drawio-trial-v1:${props.problemId}`)
const origin = 'https://embed.diagrams.net'
const url = computed(() => `${origin}/?embed=1&proto=json&spin=1&libraries=1&libs=uml&lang=zh&ui=min&dark=${props.theme === 'dark' ? '1' : '0'}&noSaveBtn=1&noExitBtn=1&saveAndExit=0`)
const xml = ref('')
let sequence = 0
let latestExportSucceeded = false
let downloadedXml: string | null = null
let confirmedBackupXml: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let pending: { id: number; resolve: (ok: boolean) => void; timeout: ReturnType<typeof setTimeout> } | null = null

function loadLocalDraft() {
  try {
    xml.value = localStorage.getItem(storageKey.value) ?? ''
  } catch {
    storageOk.value = false
    status.value = '浏览器存储不可用；请下载 .drawio 文件备份。'
  }
}
function storeSnapshot(value: string) {
  xml.value = value
  try {
    localStorage.setItem(storageKey.value, value)
    storageOk.value = true
    status.value = '试用草稿已保存到当前浏览器'
  } catch {
    storageOk.value = false
    status.value = '浏览器存储不可用；请下载 .drawio 文件备份。'
  }
}
function post(message: object) {
  frame.value?.contentWindow?.postMessage(JSON.stringify(message), origin)
}
function handleMessage(event: MessageEvent) {
  if (event.origin !== origin || event.source !== frame.value?.contentWindow || typeof event.data !== 'string') return
  let data: any
  try { data = JSON.parse(event.data) } catch { return }
  if (!data || typeof data !== 'object') return
  if (data.event === 'init') {
    // Wait for the load acknowledgement before enabling navigation/exports.
    post({ action: 'load', xml: xml.value, autosave: 1, noSaveBtn: 1, noExitBtn: 1, saveAndExit: 0 })
  } else if (data.event === 'load') {
    if (data.error) { status.value = '草稿加载失败；原始草稿仍保存在本机，请下载备份。'; loadingSlow.value = true; return }
    ready.value = true
    loadingSlow.value = false
    status.value = storageOk.value ? '编辑后自动保存到当前浏览器' : '浏览器存储不可用；请下载 .drawio 文件备份。'
  } else if ((data.event === 'autosave' || data.event === 'save') && typeof data.xml === 'string' && data.xml.trim()) {
    storeSnapshot(data.xml)
  } else if (data.event === 'export' && pending && data.message?.umlOjRequestId === pending.id) {
    const request = pending
    pending = null
    clearTimeout(request.timeout)
    if (data.format === 'xml' && typeof data.xml === 'string' && data.xml.trim()) {
      storeSnapshot(data.xml)
      latestExportSucceeded = true
      request.resolve(storageOk.value || data.xml === confirmedBackupXml)
    } else {
      status.value = '无法获取当前画布，请重试；切换已取消。'
      request.resolve(false)
    }
  }
}
function flush(): Promise<boolean> {
  // If initialization never completed, the user has not been given an editable
  // graph. The on-screen fallback can safely return to the original editor.
  if (!ready.value) return Promise.resolve(true)
  if (pending) return Promise.resolve(false)
  latestExportSucceeded = false
  return new Promise(resolve => {
    const id = ++sequence
    const timeout = setTimeout(() => {
      if (pending?.id !== id) return
      pending = null
      status.value = '无法获取当前画布，请检查网络后重试；切换已取消。'
      resolve(false)
    }, 8000)
    pending = { id, resolve, timeout }
    status.value = '正在保存当前画布…'
    post({ action: 'export', format: 'xml', umlOjRequestId: id })
  })
}
async function download() {
  // A failed request must not be presented as a current backup. When storage
  // alone fails, an actual export still supplies a fresh downloadable snapshot.
  if (ready.value) {
    const saved = await flush()
    if (!saved && !latestExportSucceeded) return
  }
  if (!xml.value) { status.value = '尚无可下载的画布内容。'; return }
  const blob = new Blob([xml.value], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `uml-oj-${props.problemId}.drawio`
  link.click()
  downloadedXml = xml.value
  hasDownloaded.value = true
  if (!storageOk.value) status.value = '已发起下载。请确认文件已保存，再确认备份；若画布再次修改请重新下载。'
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function confirmBackup() {
  if (downloadedXml && window.confirm('请先确认下载的 .drawio 文件已成功保存。确认后才允许在本机存储不可用时离开；后续修改需要重新备份。')) {
    confirmedBackupXml = downloadedXml
    status.value = '备份已确认；切换前会再次核对画布是否变化。'
  }
}
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!ready.value) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => {
  loadLocalDraft()
  window.addEventListener('message', handleMessage)
  window.addEventListener('beforeunload', warnBeforeUnload)
  timer = setTimeout(() => { if (!ready.value) loadingSlow.value = true }, 10000)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  window.removeEventListener('message', handleMessage)
  window.removeEventListener('beforeunload', warnBeforeUnload)
  if (pending) { clearTimeout(pending.timeout); pending.resolve(false); pending = null }
})
defineExpose({ flush })
</script>

<template>
  <div class="drawio-trial">
    <div class="drawio-notice" role="status">
      <span><strong>draw.io 试用：</strong>独立草稿，不与源码或原画布同步，暂不支持提交评测。离开前请等待保存，也可下载备份。</span>
      <button class="drawio-download" @click="download"><Download :size="14" />下载 .drawio</button>
      <button v-if="!storageOk && hasDownloaded" class="drawio-download" @click="confirmBackup">确认已保存备份</button>
    </div>
    <div class="drawio-frame-wrap" :class="{ 'is-busy': busy }">
      <iframe ref="frame" :src="url" :inert="!ready || busy" title="draw.io 类图试用画布" referrerpolicy="no-referrer" allow="clipboard-read; clipboard-write"></iframe>
      <div v-if="!ready" class="drawio-loading" role="status">
        <template v-if="loadingSlow"><strong>draw.io 暂未连接</strong><p>试用画布需要访问 embed.diagrams.net。请检查网络，也可以切回源码或原画布；原有草稿不会受影响。</p><a href="https://www.drawio.com/" target="_blank" rel="noopener noreferrer">了解 draw.io <ExternalLink :size="14" /></a></template>
        <span v-else>正在连接 draw.io…</span>
      </div>
    </div>
    <div class="drawio-status" :class="{ 'drawio-error': !storageOk }" role="status">{{ status }}</div>
  </div>
</template>
