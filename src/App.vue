<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import {
  ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, BookOpen,
  Check, ChevronDown, ChevronRight, ChevronUp, Circle, ClipboardCheck,
  CodeXml, CornerDownLeft, FileCode2, FileText, Minus, Moon, Network, Play, Search, Sun, X,
  setLucideProps,
} from '@lucide/vue'
import { emptySource, problems } from './problems'
import { buildCatalog, catalogStatuses, catalogTopics, challengeLevels, filterCatalog } from './catalog'
import type { CatalogStatus } from './catalog'
import { fromDiagram, judge } from './judge'
import type { TestResult } from './judge'
import { parsePlantUml, toPlantUml } from './uml/adapters/plantuml'
import NativeCanvas from './NativeCanvas.vue'
import './native-canvas.css'
import { parseMermaid, toMermaid } from './uml/adapters/mermaid'
import { assertOjDiagram } from './uml/model'
import type { Diagram } from './uml/model'

// Named imports keep the icon bundle tree-shakable. Decorative SVGs are
// aria-hidden by Lucide; controls keep their text and accessible names.
setLucideProps({ size: 16, strokeWidth: 2, class: 'app-icon' })

const theme = ref<'light' | 'dark'>(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
async function toggleTheme() {
  if (!(await leaveCanvasSafely())) return
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
  try { localStorage.setItem('uml-oj-theme', theme.value) } catch { /* Theme still works for this page. */ }
}
const problemPanel = ref<HTMLElement | null>(null)
const feedback = ref<HTMLElement | null>(null)
const layout = ref<HTMLElement | null>(null)
const editorPanes = ref<HTMLElement | null>(null)
const workspace = ref<HTMLElement | null>(null)
const editorWidth = ref(0)
let editorObserver: ResizeObserver | null = null
const editorSplitStorageKey = 'uml-oj-editor-split-v1'
const isNarrow = ref(typeof window !== 'undefined' && window.innerWidth <= 760)
const isWide = ref(window.innerWidth >= 1100)
function updateViewport() {
  const narrow = window.innerWidth <= 760
  if (narrow && !isNarrow.value && canvasDirty.value) sourceMode.value = false
  isNarrow.value = narrow
  isWide.value = window.innerWidth >= 1100
}
const problemWidth = ref(32)
const feedbackOpen = ref(false)
const canvasWidth = ref(50)
const feedbackHeight = ref<number | null>(null)
const editorBounds = computed(() => {
  const available = editorWidth.value - 8
  if (available <= 360) return { min: 20, max: 80 }
  const min = Math.max(5, Math.ceil(200 / available * 100))
  const max = Math.min(95, Math.floor((available - 170) / available * 100))
  return { min: Math.min(min, max), max }
})
const canvasPercent = computed(() => Math.max(editorBounds.value.min, Math.min(editorBounds.value.max, canvasWidth.value)))
const reportPercent = computed(() => feedbackHeight.value ?? 32)
const guideOpen = ref(true)
const problemVisible = ref(true)
const emptyDiagram = (): Diagram => ({ classes: [], relations: [] })
const answer = ref<Diagram>(emptyDiagram())
const selectedId = ref(problems[0].id)
const problem = computed(() => problems.find(p => p.id === selectedId.value)!)
const results = ref<TestResult[] | null>(null)
const error = ref('')
const view = ref<'catalog' | 'workspace'>('catalog')
const sourceMode = ref(true)
const canvasFocus = ref(false)
const sourceVisible = computed(() => isNarrow.value ? sourceMode.value : !canvasFocus.value)
function toggleCanvasFocus() {
  canvasFocus.value = !canvasFocus.value
}
const canvas = ref<InstanceType<typeof NativeCanvas> | null>(null)
const canvasDirty = ref(false)
const sourceElement = ref<HTMLTextAreaElement | null>(null)
type SourceFormat = 'plantuml' | 'mermaid'
const sourceFormat = ref<SourceFormat>('plantuml')
type SourceVariant = { text: string; key: string }
let sourceVariants: Partial<Record<SourceFormat, SourceVariant>> = {}
const syncState = ref<'synced' | 'pending' | 'source-error' | 'canvas-error' | 'conflict'>('pending')
const syncMessage = ref('正在同步…')
let syncTimer: ReturnType<typeof setTimeout> | undefined
let updatingSource = false
const transitioning = ref(false)
const source = ref(problem.value.lesson?.starter ?? emptySource)
const completed = ref(new Set<string>())
const showSolution = ref(false)
const lessons = problems.filter(p => p.lesson)
const challenges = problems.filter(p => !p.lesson)
type Section = 'tutorial' | 'challenge'
const section = computed<Section>(() => problem.value.lesson ? 'tutorial' : 'challenge')
const sectionProblems = computed(() => section.value === 'tutorial' ? lessons : challenges)
const attempted = ref(new Set<string>())
const catalogQuery = ref('')
const catalogStatus = ref<'all' | CatalogStatus>('all')
const catalogDifficulty = ref<'all' | typeof challengeLevels[number]>('all')
const catalogTopic = ref<'all' | typeof catalogTopics[number]>('all')
const catalogSort = ref<'number' | 'difficulty-asc' | 'difficulty-desc'>('number')
const catalogBase = computed(() => buildCatalog(sectionProblems.value, completed.value, attempted.value))
const catalogEntries = computed(() => filterCatalog(catalogBase.value, {
  query: catalogQuery.value, status: catalogStatus.value, difficulty: catalogDifficulty.value,
  topic: catalogTopic.value, sort: catalogSort.value,
}))
const availableTopics = computed(() => catalogTopics.filter(topic => catalogBase.value.some(entry => entry.topics.includes(topic))))
const hasCatalogFilters = computed(() => !!catalogQuery.value || catalogStatus.value !== 'all' || catalogDifficulty.value !== 'all' || catalogTopic.value !== 'all' || catalogSort.value !== 'number')
const statusLabels = Object.fromEntries(catalogStatuses.map(status => [status.id, status.label]))
function resetCatalogFilters() {
  catalogQuery.value = ''
  catalogStatus.value = 'all'
  catalogDifficulty.value = 'all'
  catalogTopic.value = 'all'
  catalogSort.value = 'number'
}
const lastSelected: Record<Section, string> = { tutorial: lessons[0].id, challenge: challenges[0].id }
const nextProblem = computed(() => sectionProblems.value[sectionProblems.value.findIndex(p => p.id === selectedId.value) + 1])
const gradableChallenges = challenges.filter(p => !p.referenceOnly)
const challengeProgress = computed(() => gradableChallenges.filter(p => completed.value.has(p.id)).length)
async function switchSection(target: Section) {
  if (!(await leaveCanvasSafely())) return
  if (target !== section.value) {
    resetCatalogFilters()
    openProblem(lastSelected[target])
  }
  view.value = 'catalog'
  window.scrollTo({ top: 0 })
}
function enterProblem(id: string) {
  openProblem(id)
  view.value = 'workspace'
  window.scrollTo({ top: 0 })
}
async function returnToCatalog() {
  if (!(await leaveCanvasSafely())) return
  view.value = 'catalog'
  window.scrollTo({ top: 0 })
}
const accepted = computed(() => !!results.value?.length && passed.value === results.value.length)
const lessonProgress = computed(() => lessons.filter(p => completed.value.has(p.id)).length)
const notice = ref('源码和本地画布共用同一份答案；画布编辑请先应用更改。')
const passed = computed(() => results.value?.filter(r => r.passed).length ?? 0)
const reportRows = computed(() => {
  const rows = results.value ?? []
  return [...rows.filter(r => !r.passed), ...rows.filter(r => r.passed)]
})
type Draft = { source: string; model: Diagram; sourceMode: boolean; syncedKey: string | null; sourceFormat?: SourceFormat; sourceVariants?: Partial<Record<SourceFormat, SourceVariant>>; evaluated?: boolean }
const drafts = new Map<string, Draft>()
const storageAvailable = ref(true)
const storageKey = 'uml-oj-native-drafts-v1'
let saveBlocked = false
let saveTimer: ReturnType<typeof setTimeout> | undefined
let restoring = true
let syncedKey: string | null = null

function saveDrafts() {
  if (restoring || saveBlocked) return
  try {
    const data = Object.fromEntries(drafts)
    data[selectedId.value] = { source: source.value, model: answer.value, sourceMode: sourceMode.value, syncedKey, sourceFormat: sourceFormat.value, sourceVariants, evaluated: results.value !== null }
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, turinGradingVersion: 1, drafts: data, completed: [...completed.value], attempted: [...attempted.value], selectedId: selectedId.value, view: view.value, lastSelected }))
    storageAvailable.value = true
  } catch {
    storageAvailable.value = false
  }
}
function scheduleSave() {
  if (restoring) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveDrafts, 300)
}
function restoreDrafts() {
  try {
    const text = localStorage.getItem(storageKey)
    if (!text) return
    const data = JSON.parse(text)
    if (data?.version !== 1 || !data.drafts || typeof data.drafts !== 'object') {
      saveBlocked = true
      storageAvailable.value = false
      return
    }
    for (const p of problems) {
      const d = data.drafts[p.id]
      if (!d) continue
      if (typeof d.source !== 'string' || typeof d.sourceMode !== 'boolean' || !d.model || !Array.isArray(d.model.classes) || !Array.isArray(d.model.relations)) {
        saveBlocked = true
        storageAvailable.value = false
        continue
      }
      try { assertOjDiagram(d.model); drafts.set(p.id, d) }
      catch { saveBlocked = true; storageAvailable.value = false }
    }
    if (Array.isArray(data.completed)) completed.value = new Set(data.completed.filter((id: unknown) => typeof id === 'string' && problems.some(p => p.id === id) && (!id.startsWith('turin-') || data.turinGradingVersion === 1)))
    attempted.value = new Set(problems.filter(p =>
      (Array.isArray(data.attempted) && data.attempted.includes(p.id)) || drafts.get(p.id)?.evaluated === true,
    ).map(p => p.id))
    for (const key of ['tutorial', 'challenge'] as const) {
      if (typeof data.lastSelected?.[key] === 'string' && (key === 'tutorial' ? lessons : challenges).some(p => p.id === data.lastSelected[key])) lastSelected[key] = data.lastSelected[key]
    }
    if (typeof data.selectedId === 'string' && problems.some(p => p.id === data.selectedId)) selectedId.value = data.selectedId
    const current = drafts.get(selectedId.value)
    if (current) {
      try {
        answer.value = structuredClone(current.model)
        source.value = current.source
        sourceMode.value = current.sourceMode
        sourceFormat.value = current.sourceFormat === 'mermaid' ? 'mermaid' : 'plantuml'
        sourceVariants = current.sourceVariants ?? {}
        syncedKey = typeof current.syncedKey === 'string' ? current.syncedKey : null
      } catch {
        drafts.delete(selectedId.value)
        answer.value = emptyDiagram()
        source.value = problem.value.lesson?.starter ?? emptySource
        sourceMode.value = true
        syncedKey = null
        saveBlocked = true
        storageAvailable.value = false
      }
    } else source.value = problem.value.lesson?.starter ?? emptySource
    if (data.view === 'workspace') view.value = 'workspace'
  } catch {
    saveBlocked = true
    storageAvailable.value = false
  }
}

function clearReport() { results.value = null; error.value = '' }
function restoreReport(draft: Draft | undefined) {
  if (!problem.value.referenceOnly && draft?.evaluated === true && syncState.value === 'synced' && syncedKey === draft.syncedKey) {
    results.value = judge(fromDiagram(answer.value), problem.value)
  }
}
function saveEditorSplit() {
  try { localStorage.setItem(editorSplitStorageKey, String(canvasWidth.value)) } catch { /* Layout preference is optional. */ }
}
function setProblemWidth(clientX: number) {
  if (!layout.value) return
  const rect = layout.value.getBoundingClientRect()
  const min = Math.max(25, 280 / rect.width * 100)
  const max = Math.min(65, (rect.width - 420) / rect.width * 100)
  if (max > min) problemWidth.value = Math.round(Math.max(min, Math.min(max, (clientX - rect.left) / rect.width * 100)))
}
function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  const move = (e: PointerEvent) => setProblemWidth(e.clientX)
  const stop = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', stop)
    handle.removeEventListener('pointercancel', stop)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('pointercancel', stop)
}
function resizeWithKeyboard(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  if (!layout.value) return
  const rect = layout.value.getBoundingClientRect()
  setProblemWidth(rect.left + rect.width * (problemWidth.value + (event.key === 'ArrowLeft' ? -2 : 2)) / 100)
}
type WorkbenchSplit = 'canvas' | 'report'
const liveSplits = new Map<WorkbenchSplit, number>()
function setWorkbenchSplit(split: WorkbenchSplit, value: number) {
  const [min, max] = split === 'canvas' ? [editorBounds.value.min, editorBounds.value.max] : [24, 55]
  const size = Math.round(Math.max(min, Math.min(max, value)))
  if (split === 'canvas') canvasWidth.value = size
  else feedbackHeight.value = size
}
function startWorkbenchSplit(event: PointerEvent, split: WorkbenchSplit) {
  if (event.button !== 0 || !event.isPrimary) return
  const handle = event.currentTarget as HTMLElement
  liveSplits.set(split, event.pointerId)
  handle.setPointerCapture(event.pointerId)
}
function moveWorkbenchSplit(event: PointerEvent, split: WorkbenchSplit) {
  if (liveSplits.get(split) !== event.pointerId) return
  const rect = (split === 'canvas' ? editorPanes : workspace).value?.getBoundingClientRect()
  if (!rect) return
  if (split === 'canvas') setWorkbenchSplit(split, (event.clientX - rect.left - 4) / (rect.width - 8) * 100)
  else setWorkbenchSplit(split, (rect.bottom - event.clientY - 4) / rect.height * 100)
}
function stopWorkbenchSplit(event: PointerEvent, split: WorkbenchSplit) {
  if (liveSplits.get(split) !== event.pointerId) return
  liveSplits.delete(split)
  if (split === 'canvas') saveEditorSplit()
}
function keyboardWorkbenchSplit(event: KeyboardEvent, split: WorkbenchSplit) {
  if (split === 'canvas' && editorPanes.value) editorWidth.value = editorPanes.value.getBoundingClientRect().width
  const [increase, decrease, current, step] = split === 'canvas'
    ? ['ArrowRight', 'ArrowLeft', canvasPercent.value, 2] as const
    : ['ArrowUp', 'ArrowDown', reportPercent.value, 4] as const
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    setWorkbenchSplit(split, event.key === 'Home' ? 0 : 100)
  } else if (event.key === increase || event.key === decrease) {
    event.preventDefault()
    setWorkbenchSplit(split, current + (event.key === increase ? step : -step))
  } else return
  if (split === 'canvas') saveEditorSplit()
}
function toggleProblemPanel() {
  problemVisible.value = !problemVisible.value
}
function parseCurrentSource(text = source.value): Diagram {
  return sourceFormat.value === 'mermaid' ? parseMermaid(text) : parsePlantUml(text)
}
function serializeCurrent(diagram: Diagram): string {
  return sourceFormat.value === 'mermaid' ? toMermaid(diagram) : toPlantUml(diagram)
}
function scheduleSourceSync() {
  clearTimeout(syncTimer)
  syncState.value = 'pending'
  syncMessage.value = '源码已修改，正在同步画布…'
  syncTimer = setTimeout(() => syncSourceToCanvas(), 350)
}
function syncSourceToCanvas(force = false): boolean {
  clearTimeout(syncTimer)
  try {
    const parsed = parseCurrentSource()
    const key = JSON.stringify(parsed)
    const canvasKey = JSON.stringify(answer.value)
    if (!force && key !== canvasKey && (syncedKey ? canvasKey !== syncedKey : answer.value.classes.length > 0 || answer.value.relations.length > 0)) {
      syncState.value = 'conflict'
      syncMessage.value = '源码和画布都有未同步的修改，请选择保留哪一边；两边当前内容均未覆盖。'
      return false
    }
    answer.value = parsed
    syncedKey = key
    syncState.value = 'synced'; syncMessage.value = '源码与画布已同步'
    scheduleSave()
    return true
  } catch (e) {
    syncState.value = 'source-error'
    syncMessage.value = `源码未同步：${e instanceof Error ? e.message : String(e)} 画布保留上次同步的内容。`
    return false
  }
}
function syncCanvasToSource(force = false): boolean {
  try {
    const key = JSON.stringify(answer.value)
    let sourceKey: string | null = null
    try { sourceKey = JSON.stringify(parseCurrentSource()) } catch { /* retain incomplete source */ }
    if (!force && key !== sourceKey && (syncedKey ? sourceKey !== syncedKey : sourceKey === null)) {
      syncState.value = 'conflict'; syncMessage.value = '源码和画布都有未同步的修改，请选择保留哪一边；两边当前内容均未覆盖。'
      return false
    }
    if (key !== sourceKey) {
      const generated = serializeCurrent(answer.value)
      if (JSON.stringify(parseCurrentSource(generated)) !== key) throw new Error('画布内容无法无损转换为当前源码格式。')
      if (sourceKey && sourceKey === syncedKey) sourceVariants[sourceFormat.value] = { text: source.value, key: sourceKey }
      updatingSource = true
      try { source.value = generated } finally { updatingSource = false }
    }
    syncedKey = key; syncState.value = 'synced'; syncMessage.value = '源码与画布已同步'
    scheduleSave(); return true
  } catch (e) {
    syncState.value = 'canvas-error'; syncMessage.value = `画布未同步：${e instanceof Error ? e.message : String(e)} 源码保持不变。`
    return false
  }
}
function applyCanvasChange(next: Diagram): boolean {
  if (syncState.value !== 'synced') return false
  const previous = answer.value
  answer.value = next
  if (!syncCanvasToSource()) {
    answer.value = previous
    // A serialization failure concerns the staged edit, not the restored model.
    // Keep the inspector usable so the user can correct or cancel that edit.
    if ((syncState.value as string) === 'canvas-error') {
      syncState.value = 'synced'
      syncMessage.value = `${syncMessage.value} 编辑内容仍保留，可修改或撤销。`
    }
    return false
  }
  clearReport()
  return true
}
function onCanvasDirty(value: boolean) {
  canvasDirty.value = value
  if (!value && syncState.value === 'synced' && syncMessage.value.startsWith('画布未同步：')) syncMessage.value = '源码与画布已同步'
}
function prepareCanvasAction() {
  if (canvasDirty.value || canvas.value?.hasPending()) throw new Error('画布编辑面板有未应用的内容，请先应用或撤销编辑。')
  if (syncState.value === 'pending') syncSourceToCanvas()
  if (syncState.value !== 'synced') throw new Error(syncMessage.value)
}
function resolveSyncConflict(keep: 'source' | 'canvas') {
  if (syncState.value !== 'conflict') return
  if (!window.confirm(keep === 'source' ? '将用源码更新画布，画布未同步的修改会被替换。原内容会先备份。是否继续？' : '将用画布更新源码，源码未同步的修改会被替换。原内容会先备份。是否继续？')) return
  try { localStorage.setItem(`uml-oj-native-conflict-v1:${selectedId.value}:${Date.now()}`, JSON.stringify({ source: source.value, sourceFormat: sourceFormat.value, model: answer.value, syncedKey })) }
  catch { storageAvailable.value = false; syncMessage.value = '无法备份冲突内容，未覆盖任何一边。'; return }
  if (keep === 'source' ? syncSourceToCanvas(true) : syncCanvasToSource(true)) { sourceMode.value = keep === 'source'; clearReport() }
}
function reconcileAfterRestore() {
  let sourceKey: string | null = null
  try { sourceKey = JSON.stringify(parseCurrentSource()) } catch { /* incomplete source stays intact */ }
  const canvasKey = JSON.stringify(answer.value)
  if (sourceKey !== null && sourceKey === canvasKey) {
    syncedKey = sourceKey; syncState.value = 'synced'; syncMessage.value = '源码与画布已同步'
  } else if ((syncedKey && canvasKey === syncedKey) || (!syncedKey && !answer.value.classes.length && !answer.value.relations.length)) {
    syncSourceToCanvas()
  } else if (syncedKey && sourceKey === syncedKey) {
    syncCanvasToSource()
  } else {
    syncState.value = 'conflict'; syncMessage.value = '源码和画布都有未同步的修改，请选择保留哪一边；两边当前内容均未覆盖。'
  }
}
async function changeSourceFormat(event: Event) {
  const select = event.target as HTMLSelectElement
  const target = select.value as SourceFormat
  if (target === sourceFormat.value || transitioning.value) { select.value = sourceFormat.value; return }
  transitioning.value = true
  try {
    prepareCanvasAction(); verifySynchronized()
    const model = answer.value
    const key = JSON.stringify(model)
    const output = sourceVariants[target]?.key === key ? sourceVariants[target]!.text : target === 'mermaid' ? toMermaid(model) : toPlantUml(model)
    const roundTrip = target === 'mermaid' ? parseMermaid(output) : parsePlantUml(output)
    if (JSON.stringify(roundTrip) !== key) throw new Error('目标格式不能无损表示当前类图，原内容已保留。')
    sourceVariants[sourceFormat.value] = { text: source.value, key }
    updatingSource = true
    try { sourceFormat.value = target; source.value = output } finally { updatingSource = false }
    sourceMode.value = true; scheduleSave()
  } catch (e) {
    select.value = sourceFormat.value; error.value = `无法切换源码格式：${e instanceof Error ? e.message : String(e)}`; showFeedback()
  } finally { transitioning.value = false }
}
watch(source, () => {
  if (!restoring && !updatingSource) { clearReport(); sourceMode.value = true; scheduleSourceSync() }
  scheduleSave()
}, { flush: 'sync' })
watch([sourceMode, sourceFormat, completed, view], scheduleSave, { flush: 'sync' })
async function selectProblem(event: Event) {
  const select = event.target as HTMLSelectElement
  const nextId = select.value
  if (!(await leaveCanvasSafely())) { select.value = selectedId.value; return }
  openProblem(nextId)
}
async function leaveCanvasSafely(): Promise<boolean> {
  if (transitioning.value) return false
  if (canvasDirty.value || canvas.value?.hasPending()) {
    error.value = '画布编辑面板有未应用的内容，请先应用或撤销编辑。'
    showFeedback(); return false
  }
  clearTimeout(syncTimer)
  if (syncState.value === 'pending') syncSourceToCanvas()
  saveDrafts()
  return true
}
async function chooseSource() {
  if (canvasDirty.value) { error.value = '请先应用或撤销画布编辑面板的内容。'; showFeedback(); return }
  sourceMode.value = true
  await nextTick()
  sourceElement.value?.focus()
}
async function chooseCanvas() {
  if (!(await leaveCanvasSafely())) return
  if (syncState.value === 'source-error' || syncState.value === 'conflict') {
    error.value = `画布未同步：${syncMessage.value}`
    showFeedback()
    return
  }
  sourceMode.value = false
}
function openProblem(id: string) {
  if (id === selectedId.value) return
  feedbackOpen.value = false
  showSolution.value = false
  guideOpen.value = true
  if (problemPanel.value) problemPanel.value.scrollTop = 0
  clearTimeout(syncTimer)
  canvasDirty.value = false
  drafts.set(selectedId.value, {
    source: source.value, model: structuredClone(toRaw(answer.value)), sourceMode: sourceMode.value, syncedKey, sourceFormat: sourceFormat.value, sourceVariants: structuredClone(sourceVariants), evaluated: results.value !== null,
  })
  selectedId.value = id
  lastSelected[section.value] = id
  const draft = drafts.get(id)
  updatingSource = true
  sourceFormat.value = draft?.sourceFormat === 'mermaid' ? 'mermaid' : 'plantuml'
  sourceVariants = structuredClone(draft?.sourceVariants ?? {})
  source.value = draft?.source ?? problem.value.lesson?.starter ?? emptySource
  sourceMode.value = draft?.sourceMode ?? true
  syncedKey = draft?.syncedKey ?? null
  answer.value = structuredClone(draft?.model ?? emptyDiagram())
  updatingSource = false
  reconcileAfterRestore()
  clearReport()
  restoreReport(draft)
  notice.value = `正在练习：${problem.value.title}。切换题目会保留草稿。`
  scheduleSave()
}
async function goNext() {
  if (nextProblem.value && await leaveCanvasSafely()) openProblem(nextProblem.value.id)
}
function showFeedback() {
  feedbackOpen.value = true
  nextTick(() => {
    if (window.matchMedia('(max-width: 760px)').matches) feedback.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}
function handleShortcut(event: KeyboardEvent) {
  if (view.value === 'workspace' && (event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    runTests()
  }
}
function verifySynchronized() {
  if (syncState.value === 'pending' && !syncSourceToCanvas()) throw new Error(syncMessage.value)
  if (syncState.value !== 'synced') throw new Error(syncMessage.value)
  const diagram = parseCurrentSource()
  const sourceKey = JSON.stringify(diagram)
  const canvasKey = JSON.stringify(answer.value)
  if (sourceKey !== canvasKey) {
    syncState.value = 'conflict'
    syncMessage.value = '源码和画布都有未同步的修改，请选择保留哪一边；两边当前内容均未覆盖。'
    throw new Error(syncMessage.value)
  }
  syncedKey = canvasKey
  return diagram
}
async function runTests() {
  if (problem.value.referenceOnly) {
    clearReport()
    error.value = '这道原题暂不支持自动评测；可在当前支持的范围内尝试建模，具体缺失能力见题目说明。'
    showFeedback()
    return
  }
  if (transitioning.value) return
  transitioning.value = true
  clearReport()
  try {
    prepareCanvasAction()
    const model = fromDiagram(verifySynchronized())
    results.value = judge(model, problem.value)
    attempted.value.add(selectedId.value)
    if (results.value.every(r => r.passed)) completed.value = new Set([...completed.value, selectedId.value])
    saveDrafts()
    notice.value = problem.value.lesson ? '只检查本关目标。没通过也没关系，可以展开提示或参考答案，修改后再试。' : '评测完成。只检查题目指定的类、属性和关系；不检查属性类型、可见性或布局。'
  } catch (e) {
    error.value = `无法解析模型：${e instanceof Error ? e.message : String(e)}`
    notice.value = '输入未能完成解析，请修正后重新提交。'
  } finally {
    transitioning.value = false
  }
  showFeedback()
}
async function exportJson() {
  if (transitioning.value) return
  transitioning.value = true
  try {
    prepareCanvasAction()
    const model = fromDiagram(verifySynchronized())
    const blob = new Blob([JSON.stringify({ problemId: selectedId.value, model }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `uml-oj-${selectedId.value}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    error.value = `导出失败：${e instanceof Error ? e.message : String(e)}`
    showFeedback()
  } finally {
    transitioning.value = false
  }
}
async function downloadDraftBackup() {
  if (transitioning.value) return
  transitioning.value = true
  try {
    const draft = { version: 1, problemId: selectedId.value, source: source.value, sourceFormat: sourceFormat.value, model: answer.value, layout: canvas.value?.getLayout(), icons: canvas.value?.getIcons(), pendingCanvasEdit: canvas.value?.getPending(), syncedKey, sourceVariants }
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `uml-oj-${selectedId.value}-draft-backup.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } finally {
    transitioning.value = false
  }
}
onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('pagehide', saveDrafts)
  window.addEventListener('resize', updateViewport)
  try {
    const savedSplit = Number(localStorage.getItem(editorSplitStorageKey))
    if (Number.isFinite(savedSplit) && savedSplit >= 5 && savedSplit <= 95) canvasWidth.value = savedSplit
  } catch { /* Keep the responsive default when preferences are unavailable. */ }
  if (editorPanes.value) {
    editorObserver = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width) editorWidth.value = width })
    editorObserver.observe(editorPanes.value)
  }
  try {
    restoreDrafts()
    restoring = false
    reconcileAfterRestore()
    restoreReport(drafts.get(selectedId.value))
  } catch (e) {
    restoring = false
    error.value = `画布初始化失败，可以使用 PlantUML 模式。${e instanceof Error ? e.message : ''}`
    feedbackOpen.value = true
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('pagehide', saveDrafts)
  window.removeEventListener('resize', updateViewport)
  editorObserver?.disconnect()
  clearTimeout(syncTimer)
  clearTimeout(saveTimer)
  saveDrafts()
})
</script>

<template>
  <div class="app-shell" :class="{ 'in-workspace': view === 'workspace' }">
    <header class="topbar">
      <div class="brand"><span class="brand-mark" aria-hidden="true"><Network /></span><span>UML <b>OJ</b></span></div>
      <nav class="section-nav" aria-label="练习分区">
        <button :class="{ active: section === 'tutorial' }" :aria-current="section === 'tutorial' ? 'page' : undefined" :disabled="transitioning" @click="switchSection('tutorial')">教学关卡</button>
        <button :class="{ active: section === 'challenge' }" :aria-current="section === 'challenge' ? 'page' : undefined" :disabled="transitioning" @click="switchSection('challenge')">正式挑战</button>
      </nav>
      <div class="top-actions">
        <div class="top-meta"><Circle class="live-dot" :size="7" /> 本地练习 <span class="version">无需登录</span></div>
        <button class="theme-toggle" :aria-label="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :title="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" @click="toggleTheme"><Sun v-if="theme === 'dark'" /><Moon v-else /><span class="theme-label">{{ theme === 'dark' ? '亮色' : '暗色' }}</span></button>
      </div>
    </header>
    <main v-if="view === 'catalog'" class="catalog">
      <div class="catalog-heading">
        <div>
          <h1>{{ section === 'tutorial' ? '教学关卡' : '正式题库' }}</h1>
          <p>{{ section === 'tutorial' ? '从类与属性开始，一关练一个知识点。' : '按知识点和难度挑一道 UML 建模题。' }}</p>
        </div>
        <div class="catalog-progress">
          <div><span>{{ section === 'tutorial' ? '已完成' : '已完成可评测题' }}</span><strong>{{ section === 'tutorial' ? lessonProgress : challengeProgress }}<span> / {{ (section === 'tutorial' ? lessons.length : gradableChallenges.length) }}</span></strong></div>
          <progress :value="section === 'tutorial' ? lessonProgress : challengeProgress" :max="(section === 'tutorial' ? lessons.length : gradableChallenges.length)" aria-label="本区完成进度"></progress>
        </div>
      </div>
      <div v-if="!storageAvailable" class="storage-warning" role="alert">浏览器存储不可用或草稿无法恢复。请导出答案；关闭或刷新页面可能丢失修改。</div>
      <section class="catalog-list" :aria-label="section === 'tutorial' ? '教学关卡列表' : '正式题目列表'">
        <div class="catalog-topics" role="group" aria-label="知识点">
          <button :aria-pressed="catalogTopic === 'all'" @click="catalogTopic = 'all'">全部知识点</button>
          <button v-for="topic in availableTopics" :key="topic" :aria-pressed="catalogTopic === topic" @click="catalogTopic = topic">{{ topic }}</button>
        </div>
        <div class="catalog-controls">
          <label class="catalog-search"><Search :size="14" /><input v-model="catalogQuery" type="search" aria-label="搜索题目" placeholder="搜索题号、标题或知识点" /></label>
          <div class="catalog-filters">
            <label class="catalog-select"><select v-model="catalogStatus" aria-label="按状态筛选">
              <option value="all">全部状态</option>
              <option v-for="status in catalogStatuses" :key="status.id" :value="status.id">{{ status.label }}</option>
            </select><ChevronDown :size="12" /></label>
            <template v-if="section === 'challenge'">
              <label class="catalog-select"><select v-model="catalogDifficulty" aria-label="按难度筛选">
                <option value="all">全部难度</option>
                <option v-for="level in challengeLevels" :key="level">{{ level }}</option>
              </select><ChevronDown :size="12" /></label>
              <label class="catalog-select"><select v-model="catalogSort" aria-label="题目排序">
                <option value="number">按题号</option>
                <option value="difficulty-asc">难度从低到高</option>
                <option value="difficulty-desc">难度从高到低</option>
              </select><ChevronDown :size="12" /></label>
            </template>
          </div>
        </div>
        <table class="catalog-table">
          <thead><tr>
            <th scope="col" class="catalog-state-col">状态</th>
            <th scope="col">题目</th>
            <th v-if="section === 'challenge'" scope="col" class="catalog-level-col">难度</th>
            <th scope="col" class="catalog-time-col">预计用时</th>
            <th scope="col" class="catalog-topic-col">知识点</th>
          </tr></thead>
          <tbody>
            <tr v-for="entry in catalogEntries" :key="entry.problem.id" class="catalog-row">
              <td>
                <span class="catalog-status" :class="entry.status">
                  <Check v-if="entry.status === 'solved'" :size="14" /><Circle v-else-if="entry.status === 'attempted'" :size="14" /><BookOpen v-else-if="entry.status === 'reference'" :size="14" /><Minus v-else :size="14" />
                  <span>{{ statusLabels[entry.status] }}</span>
                </span>
              </td>
              <td><button class="catalog-title" :aria-label="`${section === 'tutorial' ? '开始学习' : '开始作答'}：${entry.problem.title}`" @click="enterProblem(entry.problem.id)">
                <span v-if="section === 'challenge'" class="catalog-number" aria-hidden="true">{{ entry.number }}.</span>
                {{ entry.problem.title }}
              </button><span v-if="entry.multiple" class="catalog-multiple">多解</span></td>
              <td v-if="section === 'challenge'"><span class="catalog-level" :data-level="entry.difficulty">{{ entry.difficulty ?? '未分级' }}</span></td>
              <td class="catalog-time-col">{{ entry.duration || '—' }}</td>
              <td class="catalog-topic-col"><span class="catalog-tags"><span v-for="topic in entry.topics" :key="topic">{{ topic }}</span></span></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!catalogEntries.length" class="catalog-empty"><p>没有符合条件的题目。</p></div>
        <div class="catalog-list-foot"><span role="status">显示 {{ catalogEntries.length }} / {{ sectionProblems.length }} 道题</span><button v-if="hasCatalogFilters" @click="resetCatalogFilters">清除搜索和筛选</button></div>
      </section>
      <p class="catalog-note">{{ storageAvailable ? '进度和草稿保存在当前浏览器中。' : '存储不可用，当前进度仅在本页有效。' }}</p>
    </main>
    <main v-show="view === 'workspace'" ref="layout" class="layout" :class="{ 'problem-collapsed': !problemVisible }" :style="{ '--problem-width': `${problemWidth}%` }">
      <aside v-show="problemVisible" id="problem-panel" class="problem-panel" aria-label="题目说明">
        <div class="problem-bar"><span class="icon-label"><FileText class="panel-icon" />题目描述</span><button class="back-to-catalog" :disabled="transitioning" @click="returnToCatalog"><ArrowLeft :size="14" />{{ section === 'tutorial' ? '返回教学关卡' : '返回正式题库' }}</button></div>
        <div ref="problemPanel" class="problem-scroll" tabindex="0">
        <label class="eyebrow" for="problem-select">{{ section === 'tutorial' ? '选择教学关卡' : '选择正式关卡' }}</label>
        <div class="problem-select-wrap">
          <select id="problem-select" :value="selectedId" :disabled="transitioning" class="problem-select" @change="selectProblem">
            <option v-for="(p, i) in sectionProblems" :key="p.id" :value="p.id">{{ i + 1 }}. {{ p.title }}{{ p.referenceOnly ? '（待支持评测）' : completed.has(p.id) ? '（已完成）' : '' }}</option>
          </select>
          <ChevronDown class="select-chevron" />
        </div>
        <div v-if="section === 'tutorial'" class="learning-progress">教学进度 {{ lessonProgress }}/{{ lessons.length }}<progress :value="lessonProgress" :max="lessons.length" aria-label="教学进度"></progress></div>
        <div v-else class="learning-progress">可评测题进度 {{ challengeProgress }}/{{ gradableChallenges.length }}<progress :value="challengeProgress" :max="gradableChallenges.length" aria-label="挑战进度"></progress></div>
        <div class="problem-heading"><span class="problem-tag">{{ problem.lesson ? '循序练习' : problem.referenceOnly ? '原题参考' : '独立挑战' }}</span><span class="problem-level">{{ problem.level }}</span></div>
        <h1>{{ problem.title }}</h1>
        <p class="lead">{{ problem.description }}</p>
        <p v-if="problem.source" class="problem-source">来源：<a :href="problem.source.url" target="_blank" rel="noopener noreferrer">{{ problem.source.title }}（第 {{ problem.source.page }} 页）</a>。{{ problem.source.note }}</p>
        <section class="statement">
          <h2>{{ problem.lesson ? '本关任务' : '业务需求' }}</h2>
          <ol><li v-for="line in problem.requirements" :key="line">{{ line }}</li></ol>
          <a class="mobile-jump" href="#workspace">开始作答 <ArrowDown /></a>
        </section>
        <section v-if="problem.assessmentNote" class="reference-note" aria-label="本题评测约定">
          <h2>本题评测约定</h2>
          <p>以下英文名称和指定关系是 OJ 为自动评测补充的约定，不是原题原文。名称不区分大小写；可添加额外元素。属性只检查名称，不检查类型或可见性。</p>
          <ul>
            <li v-for="item in problem.classes" :key="item.name"><strong>{{ item.name }}</strong> 类<span v-if="item.attributes.length">：属性 {{ item.attributes.join('、') }}</span></li>
            <li v-for="[a, b, ma, mb] in problem.relations" :key="`${a}-${b}`">{{ a }} 与 {{ b }}：普通关联<span v-if="ma">，{{ a }} 端 {{ ma }}</span><span v-if="mb">，{{ b }} 端 {{ mb }}</span>。</li>
            <li v-for="r in problem.typedRelations" :key="`${r.source}-${r.target}-${r.type}`">{{ r.source }} {{ r.type === 'ClassInheritance' ? '继承' : '实现' }} {{ r.target }}（箭头指向 {{ r.target }}）。</li>
            <li v-for="r in problem.namedRelations" :key="`${r.source}-${r.target}-${r.label}`">{{ r.source }} 与 {{ r.target }}：普通关联，关系名称 <strong>{{ r.label }}</strong><span v-if="r.sourceMultiplicity">，{{ r.source }} 端 {{ r.sourceMultiplicity }}</span><span v-if="r.targetMultiplicity">，{{ r.target }} 端 {{ r.targetMultiplicity }}</span>；若设置方向须从 {{ r.source }} 指向 {{ r.target }}。</li>
          </ul>
          <p>{{ problem.assessmentNote }}</p>
        </section>
        <section v-if="problem.referenceOnly" class="reference-note" aria-label="待支持能力">
          <h2>暂不支持完整评测</h2>
          <p>题面呈现完整原题题意；可以用当前支持的功能尝试建模。以下能力尚需完善：</p>
          <ul><li v-for="item in problem.referenceOnly.missing" :key="item">{{ item }}</li></ul>
        </section>
        <section v-if="problem.lesson" :key="problem.id" class="lesson-card">
          <button class="guide-toggle" :aria-expanded="guideOpen" @click="guideOpen = !guideOpen"><span class="icon-label"><BookOpen class="guide-icon" />知识讲解与操作步骤</span><ChevronUp v-if="guideOpen" /><ChevronDown v-else /></button>
          <div v-if="guideOpen" class="guide-body">
            <p>{{ problem.lesson.concept }}</p>
            <ol><li v-for="step in problem.lesson.steps" :key="step">{{ step }}</li></ol>
            <div class="example-label">举个别的例子</div>
            <pre>{{ problem.lesson.example }}</pre>
            <button class="answer-toggle" :aria-expanded="showSolution" @click="showSolution = !showSolution">{{ showSolution ? '收起参考答案' : '查看参考答案' }}<ChevronUp v-if="showSolution" :size="14" /><ChevronDown v-else :size="14" /></button>
            <div v-if="showSolution" class="lesson-solution"><p>可以照着输入一次，再试着说出每一行的作用。</p><pre>{{ problem.lesson.solution }}</pre></div>
          </div>
        </section>
        <details class="hint"><summary><ChevronRight class="disclosure-icon" :size="14" />需要一点提示？</summary><p>{{ problem.hint }}</p></details>
        <details v-if="!problem.referenceOnly" class="hint"><summary><ChevronRight class="disclosure-icon" :size="14" />评测范围与草稿说明</summary>
          <div class="tests-info">
            <div class="test-line check-line"><Check :size="14" />{{ problem.classes.map(c => c.name).join('、') }} 类存在</div>
            <div v-if="problem.classes.some(c => c.attributes.length)" class="test-line check-line"><Check :size="14" />题目指定的属性存在</div>
            <div v-if="problem.relations.length || problem.namedRelations?.length" class="test-line check-line"><Check :size="14" />普通关联类型及题目指定的关系名称</div>
            <div v-if="problem.typedRelations?.length" class="test-line check-line"><Check :size="14" />继承、实现关系的类型和方向</div>
            <div v-if="problem.relations.some(r => r[2] !== null || r[3] !== null) || problem.namedRelations?.some(r => r.sourceMultiplicity || r.targetMultiplicity)" class="test-line check-line"><Check :size="14" />题目指定的多重性</div>
            <div v-if="problem.relationAlternatives" class="test-line check-line"><Check :size="14" />{{ problem.relationAlternatives.title }}</div>
            <div class="test-line">不检查属性类型、可见性、布局；名称不区分大小写，允许额外元素（多解题的额外路径限制除外）。</div>
            <div class="test-line">草稿保存在当前浏览器中。正式画布和源码自动同步；不支持的内容会暂停同步与评测，并保留原内容。画布的语义修改会重新生成源码，可能改变注释和排版。</div>
          </div>
        </details>
        </div>
      </aside>
      <div v-show="problemVisible" class="panel-resizer" role="separator" tabindex="0" aria-label="调整题面宽度" aria-orientation="vertical" :aria-valuenow="problemWidth" aria-valuemin="25" aria-valuemax="65" @pointerdown="startResize" @keydown="resizeWithKeyboard"><span></span></div>
      <section id="workspace" ref="workspace" class="workspace" aria-label="建模工作区">
        <a v-show="problemVisible" class="mobile-back" href="#problem-panel"><ArrowUp /> 返回题目和提示</a>
        <div class="workspace-head">
          <div class="workspace-title"><h2>开始建模</h2></div>
          <div class="toolbar">
            <button class="secondary problem-toggle" :aria-expanded="problemVisible" aria-controls="problem-panel" @click="toggleProblemPanel">{{ problemVisible ? '收起题面' : '显示题面' }}</button>
            <button v-if="!isNarrow" class="secondary" :aria-expanded="sourceVisible" aria-controls="source-pane" @click="toggleCanvasFocus">{{ canvasFocus ? '显示源码' : '专注画布' }}</button>
            <button class="secondary" title="下载当前源码与画布的原始草稿；不要求两边已经同步" @click="downloadDraftBackup">备份草稿</button>
            <button class="secondary export-button" :disabled="transitioning" @click="exportJson">导出 JSON</button>
            <button class="primary submit-button" :disabled="transitioning || !!problem.referenceOnly" :title="problem.referenceOnly ? '这道原题暂不支持自动评测' : undefined" aria-keyshortcuts="Control+Enter Meta+Enter" @click="runTests"><Play :size="14" /> 提交评测 <kbd aria-hidden="true">Ctrl <CornerDownLeft :size="12" /></kbd></button>
          </div>
        </div>
        <div v-if="isNarrow" class="editor-toolbar">
          <div class="mode-switch" role="group" aria-label="编辑方式">
            <button :class="{ active: sourceMode }" :aria-pressed="sourceMode" :disabled="transitioning" aria-label="源码模式" @click="chooseSource"><CodeXml /> 源码</button>
            <button :class="{ active: !sourceMode }" :aria-pressed="!sourceMode" :disabled="transitioning" aria-label="画布模式" @click="chooseCanvas"><Network /> 类图画布</button>
          </div>
          <span class="sync-indicator"><ArrowLeftRight /> 自动同步</span>
        </div>
        <div ref="editorPanes" class="editor-panes" :class="{ 'canvas-focus': canvasFocus && !isNarrow }" :style="{ '--canvas-share': `${canvasPercent}%` }">
          <div id="canvas-pane" v-show="!isNarrow || !sourceMode" class="visual-pane">
            <div class="pane-heading">可视化画布 <span v-if="syncState !== 'synced'" class="stale-label">{{ syncState === 'canvas-error' ? '请修正画布' : '画布未同步' }}</span></div>
            <NativeCanvas ref="canvas" :diagram="answer" :problem-id="selectedId" :disabled="syncState !== 'synced' || transitioning" :on-apply="applyCanvasChange" @dirty="onCanvasDirty" />
          </div>
          <div v-if="!isNarrow && !canvasFocus" class="workbench-splitter" role="separator" tabindex="0"
            aria-label="调整画布和源码宽度" aria-controls="canvas-pane" aria-orientation="vertical" :aria-valuemin="editorBounds.min" :aria-valuemax="editorBounds.max" :aria-valuenow="canvasPercent"
            @pointerdown="startWorkbenchSplit($event, 'canvas')" @pointermove="moveWorkbenchSplit($event, 'canvas')"
            @lostpointercapture="stopWorkbenchSplit($event, 'canvas')" @keydown="keyboardWorkbenchSplit($event, 'canvas')"><span></span></div>
          <div id="source-pane" v-show="sourceVisible" class="source-wrap">
            <div class="source-label"><span class="icon-label"><FileCode2 class="file-icon" :size="14" />{{ sourceFormat === 'plantuml' ? 'solution.puml' : 'solution.mmd' }}</span><label>源码格式 <select :value="sourceFormat" aria-label="源码格式" :disabled="transitioning" @change="changeSourceFormat"><option value="plantuml">PlantUML</option><option value="mermaid">Mermaid</option></select></label></div>
            <textarea ref="sourceElement" v-model="source" spellcheck="false" :readonly="syncState === 'canvas-error' || syncState === 'conflict' || canvasDirty" :aria-label="sourceFormat === 'plantuml' ? 'PlantUML source' : 'Mermaid source'"></textarea>
            <details class="source-note"><summary><ChevronRight class="disclosure-icon" :size="14" />查看语法提示（不是本题答案）</summary>
              <pre v-if="sourceFormat === 'plantuml'">class Example {
  - code: String
}
Example "1" -- "0..*" OtherExample
Child --|&gt; Parent
Car -- "1" Driver : owner</pre>
              <pre v-else>classDiagram
class Example {
  -String code
}
Example "1" -- "0..*" OtherExample
Child --|&gt; Parent
Car -- "1" Driver : owner</pre>
              <p>仅支持部分 UML 类图语法；不支持的内容会暂停同步，保留原内容。双引号中的数字是该端多重性；冒号后的文字是关系名称，继承箭头指向父类。画布中可点击连线，在属性面板填写名称并选择方向或类型。</p>
            </details>
          </div>
        </div>
        <div class="statusbar" role="status"><Circle class="live-dot" :size="7" /><span :title="syncMessage">{{ syncMessage }}</span><span class="local-badge">{{ storageAvailable ? '草稿保存在本机' : '草稿未保存，请导出' }}</span></div>
        <div v-if="syncState === 'source-error' || syncState === 'canvas-error'" class="sync-warning" role="status">{{ syncMessage }}</div>
        <div v-if="canvasDirty" class="sync-warning" role="status">画布编辑面板有未应用的内容，请先应用或撤销，再编辑源码或提交。</div>
        <div v-if="syncState === 'conflict'" class="sync-conflict" role="alert"><span>源码与画布不一致，提交已暂停。请选择要继续使用的内容；另一侧将先备份到本机。</span><button class="secondary" @click="resolveSyncConflict('source')">使用源码</button><button class="secondary" @click="resolveSyncConflict('canvas')">使用画布</button></div>
        <div v-if="!storageAvailable" class="storage-warning workspace-warning" role="alert">浏览器存储不可用或草稿无法恢复，请导出答案；刷新可能丢失修改。</div>
        <div ref="feedback" class="feedback-anchor" :class="{ expanded: feedbackOpen }" :style="{ '--report-share': feedbackHeight === null ? undefined : `${feedbackHeight}%` }">
        <div v-if="feedbackOpen && !isNarrow" class="workbench-splitter split-horizontal" role="separator" tabindex="0"
          aria-label="调整评测报告高度" aria-controls="feedback-content" aria-orientation="horizontal" aria-valuemin="24" aria-valuemax="55" :aria-valuenow="reportPercent"
          @pointerdown="startWorkbenchSplit($event, 'report')" @pointermove="moveWorkbenchSplit($event, 'report')"
          @lostpointercapture="stopWorkbenchSplit($event, 'report')" @keydown="keyboardWorkbenchSplit($event, 'report')"><span></span></div>
        <button class="feedback-toggle" :aria-expanded="feedbackOpen" aria-controls="feedback-content" @click="feedbackOpen = !feedbackOpen"><span class="icon-label"><ClipboardCheck class="panel-icon" />评测结果 <span v-if="results" class="feedback-summary" :class="accepted ? 'ok' : 'fail'">{{ accepted ? '通过' : '未通过' }} · {{ passed }}/{{ results.length }}</span><span v-else-if="error" class="feedback-summary fail">输入错误</span><span v-else class="feedback-empty">{{ problem.referenceOnly ? '暂不支持自动评测' : '当前答案未评测' }}</span></span><ChevronDown v-if="feedbackOpen" /><ChevronUp v-else /></button>
        <div v-show="feedbackOpen" id="feedback-content" class="feedback-content">
        <p v-if="!error && !results" class="feedback-placeholder">{{ problem.referenceOnly ? '当前为原题参考模式，尚不能对完整题目自动评测。' : '提交后在这里查看逐项评测结果。' }}</p>
        <section v-if="error" class="results error-report" role="alert"><h2>暂时无法完成操作</h2><pre>{{ error }}</pre></section>
        <section v-if="results" class="results" aria-live="polite">
          <div class="result-head">
            <div><div class="eyebrow">评测结果</div><h2>{{ problem.title }} · 评测报告</h2></div>
            <div class="score"><strong>{{ passed }}/{{ results.length }}</strong><span>{{ accepted ? '测试通过' : `${results.length - passed} 项待修正` }}</span></div>
          </div>
          <div class="verdict" :class="accepted ? 'accepted' : 'wrong'"><Check v-if="accepted" /><X v-else />{{ problem.lesson ? (accepted ? '本关通过！' : '再试一下，下面还有提示') : (accepted ? 'ACCEPTED' : 'WRONG ANSWER') }}</div>
          <div v-if="accepted && problem.lesson" class="lesson-complete">
            <p>{{ problem.lesson.takeaway }}</p>
            <button v-if="nextProblem" class="primary" @click="goNext">进入下一关 <ArrowRight /></button>
            <div v-else><b>全部教学已完成。</b><p>想独立练习时，可以从顶部的“正式挑战”进入题库；也可以留在这里复习。</p></div>
          </div>
          <div v-for="r in reportRows" :key="r.id" class="result-row" :class="{ 'result-needs-fix': !r.passed }">
            <span class="result-icon" :class="r.passed ? 'ok' : 'fail'" aria-hidden="true"><Check v-if="r.passed" :size="14" /><X v-else :size="14" /></span>
            <div class="result-copy"><b>{{ r.title }}</b><small>{{ r.detail }}</small></div>
            <span class="result-state" :class="r.passed ? 'ok' : 'fail'">{{ r.passed ? 'PASS' : 'FAIL' }}</span>
          </div>
        </section>
        </div>
        </div>
      </section>
    </main>
    <footer v-if="view === 'catalog'"><span>UML OJ · UML 建模练习</span><span>画布：本地类图编辑器</span></footer>
  </div>
</template>
