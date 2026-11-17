<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, BookOpen,
  Check, ChevronDown, ChevronRight, ChevronUp, Circle, ClipboardCheck,
  CodeXml, CornerDownLeft, FileCode2, FileText, Moon, Network, Play, Sun, X,
  setLucideProps,
} from '@lucide/vue'
import { ApollonEditor, PALETTE_ID, paletteControl, UMLDiagramType } from '@tumaet/apollon'
import type { UMLModel } from '@tumaet/apollon'
import '@tumaet/apollon/style.css'
import { emptySource, problems } from './problems'
import { fromPlantUml, fromVisual, judge } from './judge'
import type { TestResult } from './judge'
import { parseSource, readVisual, semanticKey, serializeSource, toVisual } from './conversion'
import DrawioTrial from './DrawioTrial.vue'

// Named imports keep the icon bundle tree-shakable. Decorative SVGs are
// aria-hidden by Lucide; controls keep their text and accessible names.
setLucideProps({ size: 16, strokeWidth: 2, class: 'app-icon' })

const theme = ref<'light' | 'dark'>(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
async function toggleTheme() {
  if (!(await leaveDrawioSafely())) return
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
  try { localStorage.setItem('uml-oj-theme', theme.value) } catch { /* Theme still works for this page. */ }
}
const host = ref<HTMLDivElement | null>(null)
const problemPanel = ref<HTMLElement | null>(null)
const feedback = ref<HTMLElement | null>(null)
const layout = ref<HTMLElement | null>(null)
const problemWidth = ref(44)
const feedbackOpen = ref(false)
const guideOpen = ref(true)
const problemVisible = ref(true)
const paletteVisible = ref(true)
const editor = shallowRef<ApollonEditor | null>(null)
const selectedId = ref(problems[0].id)
const problem = computed(() => problems.find(p => p.id === selectedId.value)!)
const results = ref<TestResult[] | null>(null)
const error = ref('')
const view = ref<'catalog' | 'workspace'>('catalog')
const sourceMode = ref(true)
const drawioMode = ref(false)
const drawio = ref<InstanceType<typeof DrawioTrial> | null>(null)
const transitioning = ref(false)
const source = ref(problem.value.lesson?.starter ?? emptySource)
const completed = ref(new Set<string>())
const showSolution = ref(false)
const lessons = problems.filter(p => p.lesson)
const challenges = problems.filter(p => !p.lesson)
type Section = 'tutorial' | 'challenge'
const section = computed<Section>(() => problem.value.lesson ? 'tutorial' : 'challenge')
const sectionProblems = computed(() => section.value === 'tutorial' ? lessons : challenges)
const lastSelected: Record<Section, string> = { tutorial: lessons[0].id, challenge: challenges[0].id }
const nextProblem = computed(() => sectionProblems.value[sectionProblems.value.findIndex(p => p.id === selectedId.value) + 1])
const challengeProgress = computed(() => challenges.filter(p => completed.value.has(p.id)).length)
async function switchSection(target: Section) {
  if (!(await leaveDrawioSafely())) return
  drawioMode.value = false
  if (target !== section.value) openProblem(lastSelected[target])
  view.value = 'catalog'
  window.scrollTo({ top: 0 })
}
function enterProblem(id: string) {
  openProblem(id)
  view.value = 'workspace'
  window.scrollTo({ top: 0 })
  if (!sourceMode.value) nextTick(fitCanvas)
}
async function returnToCatalog() {
  if (!(await leaveDrawioSafely())) return
  drawioMode.value = false
  view.value = 'catalog'
  window.scrollTo({ top: 0 })
}
const accepted = computed(() => !!results.value?.length && passed.value === results.value.length)
const lessonProgress = computed(() => lessons.filter(p => completed.value.has(p.id)).length)
const notice = ref('源码与画布是同一份答案。切换模式时同步转换；超出支持范围会提示并保留原内容。')
const passed = computed(() => results.value?.filter(r => r.passed).length ?? 0)
type Draft = { source: string; model: UMLModel; sourceMode: boolean; syncedKey: string | null }
const drafts = new Map<string, Draft>()
const storageAvailable = ref(true)
const storageKey = 'uml-oj-drafts-v1'
let saveTimer: ReturnType<typeof setTimeout> | undefined
let restoring = true
let syncedKey: string | null = null
let blankModel: UMLModel

function saveDrafts() {
  if (restoring || !editor.value) return
  try {
    const data = Object.fromEntries(drafts)
    data[selectedId.value] = { source: source.value, model: editor.value.model, sourceMode: sourceMode.value, syncedKey }
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, drafts: data, completed: [...completed.value], selectedId: selectedId.value, view: view.value, lastSelected }))
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
    if (data?.version !== 1 || !data.drafts || typeof data.drafts !== 'object') return
    for (const p of problems) {
      const d = data.drafts[p.id]
      if (d && typeof d.source === 'string' && typeof d.sourceMode === 'boolean' && d.model && Array.isArray(d.model.nodes) && Array.isArray(d.model.edges) && typeof d.model.version === 'string') drafts.set(p.id, d)
    }
    if (Array.isArray(data.completed)) completed.value = new Set(data.completed.filter((id: unknown) => typeof id === 'string' && problems.some(p => p.id === id)))
    for (const key of ['tutorial', 'challenge'] as const) {
      if (typeof data.lastSelected?.[key] === 'string' && (key === 'tutorial' ? lessons : challenges).some(p => p.id === data.lastSelected[key])) lastSelected[key] = data.lastSelected[key]
    }
    if (typeof data.selectedId === 'string' && problems.some(p => p.id === data.selectedId)) selectedId.value = data.selectedId
    const current = drafts.get(selectedId.value)
    if (current && editor.value) {
      try {
        editor.value.model = structuredClone(current.model)
        source.value = current.source
        sourceMode.value = current.sourceMode
        syncedKey = typeof current.syncedKey === 'string' ? current.syncedKey : null
      } catch {
        drafts.delete(selectedId.value)
        editor.value.model = structuredClone(blankModel)
        source.value = problem.value.lesson?.starter ?? emptySource
        sourceMode.value = true
        syncedKey = null
        storageAvailable.value = false
      }
    } else source.value = problem.value.lesson?.starter ?? emptySource
    if (data.view === 'workspace') view.value = 'workspace'
  } catch {
    storageAvailable.value = false
  }
}

function clearReport() { results.value = null; error.value = '' }
function fitCanvas() {
  requestAnimationFrame(() => {
    if (!editor.value || !host.value) return
    const width = host.value.clientWidth
    const padding = !paletteVisible.value ? 0.15 : width >= 650
      ? { left: 320, right: 30, top: 30, bottom: 65 }
      : { left: 20, right: 20, top: 305, bottom: 65 }
    editor.value.fitView({ padding })
  })
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
    if (!sourceMode.value) fitCanvas()
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
  if (!sourceMode.value) nextTick(fitCanvas)
}
function toggleProblemPanel() {
  problemVisible.value = !problemVisible.value
  if (!sourceMode.value) nextTick(fitCanvas)
}
function togglePalette() {
  if (!editor.value) return
  if (paletteVisible.value) editor.value.removeControl(PALETTE_ID)
  else editor.value.addControl(paletteControl())
  paletteVisible.value = !paletteVisible.value
  fitCanvas()
}
watch(source, () => { clearReport(); scheduleSave() }, { flush: 'sync' })
watch([sourceMode, completed, view], scheduleSave, { flush: 'sync' })
async function selectProblem(event: Event) {
  const select = event.target as HTMLSelectElement
  const nextId = select.value
  if (!(await leaveDrawioSafely())) { select.value = selectedId.value; return }
  drawioMode.value = false
  openProblem(nextId)
}
async function leaveDrawioSafely(): Promise<boolean> {
  if (transitioning.value) return false
  if (!drawioMode.value || !drawio.value) return true
  transitioning.value = true
  try { return await drawio.value.flush() } finally { transitioning.value = false }
}
async function chooseSource() {
  if (!(await leaveDrawioSafely())) return
  drawioMode.value = false
  if (!sourceMode.value) switchMode()
}
async function chooseCanvas() {
  if (!(await leaveDrawioSafely())) return
  drawioMode.value = false
  if (sourceMode.value) switchMode()
  else nextTick(fitCanvas)
}
function chooseDrawio() {
  if (transitioning.value) return
  drawioMode.value = true
  clearReport()
}
function openProblem(id: string) {
  if (id === selectedId.value) return
  feedbackOpen.value = false
  showSolution.value = false
  guideOpen.value = true
  if (problemPanel.value) problemPanel.value.scrollTop = 0
  if (editor.value) drafts.set(selectedId.value, {
    source: source.value, model: structuredClone(editor.value.model), sourceMode: sourceMode.value, syncedKey,
  })
  selectedId.value = id
  lastSelected[section.value] = id
  const draft = drafts.get(id)
  source.value = draft?.source ?? problem.value.lesson?.starter ?? emptySource
  sourceMode.value = draft?.sourceMode ?? true
  syncedKey = draft?.syncedKey ?? null
  if (editor.value) editor.value.model = structuredClone(draft?.model ?? blankModel)
  if (!sourceMode.value) fitCanvas()
  clearReport()
  notice.value = `正在练习：${problem.value.title}。切换题目会保留草稿。`
  scheduleSave()
}
function switchMode() {
  try {
    if (!editor.value) throw new Error('画布尚未初始化，暂时无法切换。你的源码已保留。')
    if (sourceMode.value) {
      const converted = toVisual(parseSource(source.value), editor.value.model)
      const key = semanticKey(converted)
      editor.value.model = converted
      syncedKey = key
      sourceMode.value = false
      notice.value = '源码已生成类图，可以继续拖拽和编辑。已有同名类的位置会保留；切回源码时同步画布修改。'
      fitCanvas()
    } else {
      const diagram = readVisual(editor.value.model)
      const key = JSON.stringify(diagram)
      if (key !== syncedKey) source.value = serializeSource(diagram)
      syncedKey = key
      sourceMode.value = true
      notice.value = '画布已同步到源码，保留类、属性、方法、关系名称及多重性。画布有语义修改时会重新排版源码（注释不参与模型）；仅移动位置不会改写源码。'
    }
    clearReport()
  } catch (e) {
    error.value = `无法切换模式：${e instanceof Error ? e.message : String(e)}`
    notice.value = '切换未完成，仍停留在原模式，没有覆盖你的答案。'
    showFeedback()
  }
}
function showFeedback() {
  feedbackOpen.value = true
  nextTick(() => {
    if (window.matchMedia('(max-width: 760px)').matches) feedback.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}
function handleShortcut(event: KeyboardEvent) {
  if (view.value === 'workspace' && !drawioMode.value && (event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    runTests()
  }
}
function runTests() {
  if (drawioMode.value) return
  clearReport()
  try {
    if (!sourceMode.value && !editor.value) throw new Error('画布尚未初始化，请稍后再试或切换到源码模式。')
    const model = sourceMode.value ? fromPlantUml(source.value) : fromVisual(editor.value!.model)
    results.value = judge(model, problem.value)
    if (results.value.every(r => r.passed)) completed.value = new Set([...completed.value, selectedId.value])
    notice.value = problem.value.lesson ? '只检查本关目标。没通过也没关系，可以展开提示或参考答案，修改后再试。' : '评测完成。检查类、属性、普通关联及两端多重性；不检查属性类型、可见性或布局。'
  } catch (e) {
    error.value = `无法解析模型：${e instanceof Error ? e.message : String(e)}`
    notice.value = '输入未能完成解析，请修正后重新提交。'
  }
  showFeedback()
}
function exportJson() {
  if (drawioMode.value) return
  try {
    const model = sourceMode.value ? fromPlantUml(source.value) : fromVisual(editor.value!.model)
    const blob = new Blob([JSON.stringify({ problemId: selectedId.value, model }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `uml-oj-${selectedId.value}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    error.value = `导出失败：${e instanceof Error ? e.message : String(e)}`
    showFeedback()
  }
}
onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('pagehide', saveDrafts)
  try {
    if (!host.value) return
    editor.value = new ApollonEditor(host.value, { type: UMLDiagramType.ClassDiagram })
    if (window.innerWidth < 760) {
      editor.value.removeControl(PALETTE_ID)
      paletteVisible.value = false
    }
    blankModel = structuredClone(editor.value.model)
    editor.value.subscribeToModelChange(() => { if (!restoring) { clearReport(); scheduleSave() } })
    restoreDrafts()
    restoring = false
    if (view.value === 'workspace' && !sourceMode.value) nextTick(fitCanvas)
  } catch (e) {
    restoring = false
    error.value = `画布初始化失败，可以使用 PlantUML 模式。${e instanceof Error ? e.message : ''}`
    feedbackOpen.value = true
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('pagehide', saveDrafts)
  clearTimeout(saveTimer)
  saveDrafts()
  editor.value?.destroy()
})
</script>

<template>
  <div class="app-shell" :class="{ 'in-workspace': view === 'workspace' }">
    <header class="topbar">
      <div class="brand"><span class="brand-mark" aria-hidden="true">U</span><span>UML <b>OJ</b></span></div>
      <nav class="section-nav" aria-label="练习分区">
        <button :class="{ active: section === 'tutorial' }" :aria-current="section === 'tutorial' ? 'page' : undefined" @click="switchSection('tutorial')">教学关卡</button>
        <button :class="{ active: section === 'challenge' }" :aria-current="section === 'challenge' ? 'page' : undefined" @click="switchSection('challenge')">正式挑战</button>
      </nav>
      <div class="top-actions">
        <div class="top-meta"><Circle class="live-dot" :size="7" /> 本地练习 <span class="version">无需登录</span></div>
        <button class="theme-toggle" :aria-label="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :title="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" @click="toggleTheme"><Sun v-if="theme === 'dark'" /><Moon v-else /><span class="theme-label">{{ theme === 'dark' ? '亮色' : '暗色' }}</span></button>
      </div>
    </header>
    <main v-if="view === 'catalog'" class="catalog">
      <div class="catalog-heading">
        <div><div class="eyebrow">{{ section === 'tutorial' ? 'UML 入门' : '独立练习' }}</div><h1>{{ section === 'tutorial' ? '教学关卡' : '正式题库' }}</h1><p>{{ section === 'tutorial' ? '从认识类到理解多重性，一关一个知识点。' : '根据业务需求独立建模，用测试验证你的答案。' }}</p></div>
        <div class="catalog-progress"><strong>{{ section === 'tutorial' ? lessonProgress : challengeProgress }}<span> / {{ sectionProblems.length }}</span></strong><span>已完成</span></div>
      </div>
      <div v-if="!storageAvailable" class="storage-warning" role="alert">浏览器存储不可用或草稿无法恢复。请导出答案；关闭或刷新页面可能丢失修改。</div>
      <section class="catalog-list" :aria-label="section === 'tutorial' ? '教学关卡列表' : '正式题目列表'">
        <div class="catalog-list-head"><span>{{ section === 'tutorial' ? '学习路径' : '题目' }}</span><span>状态</span></div>
        <article v-for="(p, i) in sectionProblems" :key="p.id" class="catalog-row">
          <div class="catalog-number">{{ String(i + 1).padStart(2, '0') }}</div>
          <div class="catalog-copy"><h2><button class="catalog-title" @click="enterProblem(p.id)">{{ p.title }}</button></h2><p>{{ p.description }}</p><span class="catalog-level">{{ p.level }}</span></div>
          <div class="catalog-status" :class="{ done: completed.has(p.id) }"><Check v-if="completed.has(p.id)" :size="14" />{{ completed.has(p.id) ? '已完成' : '未完成' }}</div>
          <button class="catalog-enter" :aria-label="`${section === 'tutorial' ? '开始学习' : '开始作答'}：${p.title}`" @click="enterProblem(p.id)">{{ section === 'tutorial' ? '开始学习' : '开始作答' }} <ArrowRight :size="14" /></button>
        </article>
      </section>
      <p class="catalog-note">{{ storageAvailable ? '进度和草稿保存在当前浏览器中。' : '存储不可用，当前进度仅在本页有效。' }}</p>
    </main>
    <main v-show="view === 'workspace'" ref="layout" class="layout" :class="{ 'problem-collapsed': !problemVisible }" :style="{ '--problem-width': `${problemWidth}%` }">
      <aside v-show="problemVisible" id="problem-panel" class="problem-panel" aria-label="题目说明">
        <div class="problem-bar"><span class="icon-label"><FileText class="panel-icon" />题目描述</span><button class="back-to-catalog" @click="returnToCatalog"><ArrowLeft :size="14" />{{ section === 'tutorial' ? '返回教学关卡' : '返回正式题库' }}</button></div>
        <div ref="problemPanel" class="problem-scroll" tabindex="0">
        <label class="eyebrow" for="problem-select">{{ section === 'tutorial' ? '选择教学关卡' : '选择正式关卡' }}</label>
        <div class="problem-select-wrap">
          <select id="problem-select" :value="selectedId" class="problem-select" @change="selectProblem">
            <option v-for="(p, i) in sectionProblems" :key="p.id" :value="p.id">{{ i + 1 }}. {{ p.title }}{{ completed.has(p.id) ? '（已完成）' : '' }}</option>
          </select>
          <ChevronDown class="select-chevron" />
        </div>
        <div v-if="section === 'tutorial'" class="learning-progress">教学进度 {{ lessonProgress }}/{{ lessons.length }}<progress :value="lessonProgress" :max="lessons.length" aria-label="教学进度"></progress></div>
        <div v-else class="learning-progress">挑战进度 {{ challengeProgress }}/{{ challenges.length }}<progress :value="challengeProgress" :max="challenges.length" aria-label="挑战进度"></progress></div>
        <div class="problem-heading"><span class="problem-tag">{{ problem.lesson ? '循序练习' : '独立挑战' }}</span><span class="problem-level">{{ problem.level }}</span></div>
        <h1>{{ problem.title }}</h1>
        <p class="lead">{{ problem.description }}</p>
        <section class="statement">
          <h2>{{ problem.lesson ? '本关任务' : '业务需求' }}</h2>
          <ol><li v-for="line in problem.requirements" :key="line">{{ line }}</li></ol>
          <a class="mobile-jump" href="#workspace">开始作答 <ArrowDown /></a>
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
        <details class="hint"><summary><ChevronRight class="disclosure-icon" :size="14" />评测范围与草稿说明</summary>
          <div class="tests-info">
            <div class="test-line check-line"><Check :size="14" />{{ problem.classes.map(c => c.name).join('、') }} 类存在</div>
            <div v-if="problem.classes.some(c => c.attributes.length)" class="test-line check-line"><Check :size="14" />题目指定的属性存在</div>
            <div v-if="problem.relations.length" class="test-line check-line"><Check :size="14" />普通关联类型</div>
            <div v-if="problem.relations.some(r => r[2] !== null)" class="test-line check-line"><Check :size="14" />关联两端多重性</div>
            <div class="test-line">不检查属性类型、可见性、布局；名称不区分大小写，允许额外元素。</div>
            <div class="test-line">草稿保存在当前浏览器中。切换模式时同步答案；不支持转换的内容会阻止切换，保留原内容。画布修改后生成的源码可能改变原注释和排版。</div>
          </div>
        </details>
        </div>
      </aside>
      <div v-show="problemVisible" class="panel-resizer" role="separator" tabindex="0" aria-label="调整题面宽度" aria-orientation="vertical" :aria-valuenow="problemWidth" aria-valuemin="25" aria-valuemax="65" @pointerdown="startResize" @keydown="resizeWithKeyboard"><span></span></div>
      <section id="workspace" class="workspace" aria-label="建模工作区">
        <a v-show="problemVisible" class="mobile-back" href="#problem-panel"><ArrowUp /> 返回题目和提示</a>
        <div class="workspace-head">
          <div class="workspace-title"><h2>开始建模</h2></div>
          <div class="toolbar">
            <button class="secondary problem-toggle" :aria-expanded="problemVisible" aria-controls="problem-panel" @click="toggleProblemPanel">{{ problemVisible ? '收起题面' : '显示题面' }}</button>
            <button class="secondary export-button" :disabled="drawioMode || transitioning" :title="drawioMode ? 'draw.io 试用草稿暂不支持模型导出，请使用下载 .drawio' : undefined" @click="exportJson">导出 JSON</button>
            <button class="primary submit-button" :disabled="drawioMode || transitioning" :title="drawioMode ? 'draw.io 试用画布暂不支持评测' : undefined" aria-keyshortcuts="Control+Enter Meta+Enter" @click="runTests"><Play :size="14" /> 提交评测 <kbd aria-hidden="true">Ctrl <CornerDownLeft :size="12" /></kbd></button>
          </div>
        </div>
        <div class="editor-toolbar">
          <div class="mode-switch" role="group" aria-label="编辑方式">
            <button :class="{ active: sourceMode && !drawioMode }" :aria-pressed="sourceMode && !drawioMode" :disabled="transitioning" aria-label="PlantUML 源码模式" @click="chooseSource"><CodeXml /> 源码编辑</button>
            <button :class="{ active: !sourceMode && !drawioMode }" :aria-pressed="!sourceMode && !drawioMode" :disabled="transitioning" aria-label="切换到可视化绘图" @click="chooseCanvas"><Network /> 原画布</button>
            <button :class="{ active: drawioMode }" :aria-pressed="drawioMode" :disabled="transitioning" aria-label="draw.io 试用画布" @click="chooseDrawio"><Network /> draw.io 试用</button>
          </div>
          <button v-if="!sourceMode && !drawioMode" class="palette-toggle" :aria-pressed="paletteVisible" @click="togglePalette">{{ paletteVisible ? '隐藏工具箱' : '显示工具箱' }}</button>
          <span v-else-if="!drawioMode" class="sync-indicator"><ArrowLeftRight /> 切换时同步</span>
        </div>
        <div v-show="!sourceMode && !drawioMode" ref="host" class="editor-host" :data-theme="theme"></div>
        <DrawioTrial v-if="drawioMode" :key="`${selectedId}-${theme}`" ref="drawio" :problem-id="selectedId" :theme="theme" :busy="transitioning" />
        <div v-show="sourceMode && !drawioMode" class="source-wrap">
          <div class="source-label"><span class="icon-label"><FileCode2 class="file-icon" :size="14" />solution.puml</span><span>PlantUML</span></div>
          <textarea v-model="source" spellcheck="false" aria-label="PlantUML source"></textarea>
          <details class="source-note"><summary><ChevronRight class="disclosure-icon" :size="14" />查看语法提示（不是本题答案）</summary>
            <pre>class Example {
  - code: String
}
Example "1" -- "0..*" OtherExample</pre>
            <p>请显式声明所有类；目前支持基础类图语法，不支持完整 PlantUML。双引号中的数字是该端多重性。</p>
          </details>
        </div>
        <div v-if="!drawioMode" class="statusbar" role="status"><Circle class="live-dot" :size="7" /><span :title="notice">{{ notice }}</span><span class="local-badge">{{ storageAvailable ? '草稿保存在本机' : '草稿未保存，请导出' }}</span></div>
        <div v-if="!storageAvailable" class="storage-warning workspace-warning" role="alert">浏览器存储不可用或草稿无法恢复，请导出答案；刷新可能丢失修改。</div>
        <div v-show="!drawioMode" ref="feedback" class="feedback-anchor" :class="{ expanded: feedbackOpen }">
        <button class="feedback-toggle" :aria-expanded="feedbackOpen" aria-controls="feedback-content" @click="feedbackOpen = !feedbackOpen"><span class="icon-label"><ClipboardCheck class="panel-icon" />评测结果 <span v-if="results" class="feedback-summary" :class="accepted ? 'ok' : 'fail'">{{ accepted ? '通过' : '未通过' }} · {{ passed }}/{{ results.length }}</span><span v-else-if="error" class="feedback-summary fail">输入错误</span><span v-else class="feedback-empty">尚未提交</span></span><ChevronDown v-if="feedbackOpen" /><ChevronUp v-else /></button>
        <div v-show="feedbackOpen" id="feedback-content" class="feedback-content">
        <p v-if="!error && !results" class="feedback-placeholder">提交后在这里查看逐项评测结果。</p>
        <section v-if="error" class="results error-report" role="alert"><h2>暂时无法完成操作</h2><pre>{{ error }}</pre></section>
        <section v-if="results" class="results" aria-live="polite">
          <div class="result-head">
            <div><div class="eyebrow">评测结果</div><h2>{{ problem.title }} · 评测报告</h2></div>
            <div class="score"><strong>{{ passed }}/{{ results.length }}</strong><span>测试通过</span></div>
          </div>
          <div class="verdict" :class="accepted ? 'accepted' : 'wrong'"><Check v-if="accepted" /><X v-else />{{ problem.lesson ? (accepted ? '本关通过！' : '再试一下，下面还有提示') : (accepted ? 'ACCEPTED' : 'WRONG ANSWER') }}</div>
          <div v-if="accepted && problem.lesson" class="lesson-complete">
            <p>{{ problem.lesson.takeaway }}</p>
            <button v-if="nextProblem" class="primary" @click="openProblem(nextProblem.id)">进入下一关 <ArrowRight /></button>
            <div v-else><b>全部教学已完成。</b><p>想独立练习时，可以从顶部的“正式挑战”进入题库；也可以留在这里复习。</p></div>
          </div>
          <div v-for="r in results" :key="r.id" class="result-row">
            <span class="result-icon" :class="r.passed ? 'ok' : 'fail'" aria-hidden="true"><Check v-if="r.passed" :size="14" /><X v-else :size="14" /></span>
            <div class="result-copy"><b>{{ r.title }}</b><small>{{ r.detail }}</small></div>
            <span class="result-state" :class="r.passed ? 'ok' : 'fail'">{{ r.passed ? 'PASS' : 'FAIL' }}</span>
          </div>
        </section>
        </div>
        </div>
      </section>
    </main>
    <footer v-if="view === 'catalog'"><span>UML OJ · UML 建模练习</span><span>绘图组件：Apollon（MIT）</span></footer>
  </div>
</template>
