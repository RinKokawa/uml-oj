<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ApollonEditor, UMLDiagramType } from '@tumaet/apollon'
import type { UMLModel } from '@tumaet/apollon'
import '@tumaet/apollon/style.css'
import { emptySource, problems } from './problems'
import { fromPlantUml, fromVisual, judge } from './judge'
import type { TestResult } from './judge'
import { parseSource, readVisual, semanticKey, serializeSource, toVisual } from './conversion'

const host = ref<HTMLDivElement | null>(null)
const editor = shallowRef<ApollonEditor | null>(null)
const selectedId = ref(problems[0].id)
const problem = computed(() => problems.find(p => p.id === selectedId.value)!)
const results = ref<TestResult[] | null>(null)
const error = ref('')
const sourceMode = ref(true)
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
function switchSection(target: Section) {
  if (target !== section.value) openProblem(lastSelected[target])
}
const accepted = computed(() => !!results.value?.length && passed.value === results.value.length)
const lessonProgress = computed(() => lessons.filter(p => completed.value.has(p.id)).length)
const notice = ref('源码与画布是同一份答案。切换模式时同步转换；超出支持范围会提示并保留原内容。')
const passed = computed(() => results.value?.filter(r => r.passed).length ?? 0)
const drafts = new Map<string, { source: string; model: UMLModel; sourceMode: boolean; syncedKey: string | null }>()
let syncedKey: string | null = null
let blankModel: UMLModel

function clearReport() { results.value = null; error.value = '' }
watch(source, clearReport)
function selectProblem(event: Event) {
  openProblem((event.target as HTMLSelectElement).value)
}
function openProblem(id: string) {
  if (id === selectedId.value) return
  showSolution.value = false
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
  if (!sourceMode.value) requestAnimationFrame(() => editor.value?.fitView())
  clearReport()
  notice.value = `正在练习：${problem.value.title}。切换题目不会丢失本次页面中的草稿。`
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
      requestAnimationFrame(() => editor.value?.fitView())
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
  }
}
function runTests() {
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
}
function exportJson() {
  try {
    const model = sourceMode.value ? fromPlantUml(source.value) : fromVisual(editor.value!.model)
    const blob = new Blob([JSON.stringify({ problemId: selectedId.value, model }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `uml-oj-${selectedId.value}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) { error.value = `导出失败：${e instanceof Error ? e.message : String(e)}` }
}
onMounted(() => {
  try {
    if (!host.value) return
    editor.value = new ApollonEditor(host.value, { type: UMLDiagramType.ClassDiagram })
    blankModel = structuredClone(editor.value.model)
    editor.value.subscribeToModelChange(clearReport)
  } catch (e) {
    error.value = `画布初始化失败，可以使用 PlantUML 模式。${e instanceof Error ? e.message : ''}`
  }
})
onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#"><span class="brand-mark">U</span><span>UML <b>OJ</b></span></a>
      <div class="top-meta"><span class="live-dot"></span> 本地练习 · 无需登录 <span class="version">PREVIEW 0.4</span></div>
    </header>
    <nav class="section-nav" aria-label="练习分区">
      <button :class="{ active: section === 'tutorial' }" :aria-current="section === 'tutorial' ? 'page' : undefined" @click="switchSection('tutorial')">教学关卡 <span>从零学习 · {{ lessons.length }} 关</span></button>
      <button :class="{ active: section === 'challenge' }" :aria-current="section === 'challenge' ? 'page' : undefined" @click="switchSection('challenge')">正式挑战 <span>独立作答 · {{ challenges.length }} 题</span></button>
    </nav>
    <main class="layout">
      <aside class="problem-panel">
        <label class="eyebrow" for="problem-select">{{ section === 'tutorial' ? '选择教学关卡' : '选择正式关卡' }}</label>
        <p class="section-description">{{ section === 'tutorial' ? '跟着讲解与模板，一次学会一个知识点。' : '根据完整业务需求独立建模，无教学模板和参考答案。无需先通关教学。' }}</p>
        <select id="problem-select" :value="selectedId" class="problem-select" @change="selectProblem">
          <option v-for="(p, i) in sectionProblems" :key="p.id" :value="p.id">{{ completed.has(p.id) ? '✓ ' : '' }}{{ i + 1 }}. {{ p.title }}</option>
        </select>
        <div v-if="section === 'tutorial'" class="learning-progress">教学进度 {{ lessonProgress }}/{{ lessons.length }}<progress :value="lessonProgress" :max="lessons.length" aria-label="教学进度"></progress></div>
        <div v-else class="learning-progress">挑战进度 {{ challengeProgress }}/{{ challenges.length }}<progress :value="challengeProgress" :max="challenges.length" aria-label="挑战进度"></progress></div>
        <div class="eyebrow">{{ problem.level }}</div>
        <h1>{{ problem.title }}</h1>
        <p class="lead">{{ problem.description }}</p>
        <section class="statement">
          <h2>{{ problem.lesson ? '本关任务' : '业务需求' }}</h2>
          <ol><li v-for="line in problem.requirements" :key="line">{{ line }}</li></ol>
        </section>
        <section class="statement tests-info">
          <h2>评测范围</h2>
          <div class="test-line">✓ {{ problem.classes.map(c => c.name).join('、') }} 类存在</div>
          <div v-if="problem.classes.some(c => c.attributes.length)" class="test-line">✓ 题目指定的属性存在</div>
          <div v-if="problem.relations.length" class="test-line">✓ 普通关联类型</div>
          <div v-if="problem.relations.some(r => r[2] !== null)" class="test-line">✓ 关联两端多重性</div>
          <div class="test-line">不检查：属性类型、可见性、布局</div>
          <div class="test-line">名称不区分大小写；允许额外元素</div>
        </section>
        <details class="hint"><summary>需要一点提示？</summary><p>{{ problem.hint }}</p></details>
        <div class="hint">源码 ↔ 画布：切换时同步同一份答案。支持普通类、属性、方法、基础关系及多重性。超出范围会阻止切换并保留内容。画布修改后会重新生成源码，原注释与排版可能变化。草稿仅本次页面保留，刷新会清空。</div>
      </aside>
      <section class="workspace">
        <div class="workspace-head">
          <div><div class="eyebrow">YOUR SOLUTION</div><h2>建模工作区</h2></div>
          <div class="toolbar">
            <button class="secondary" @click="switchMode">{{ sourceMode ? '切换到可视化绘图' : 'PlantUML 源码模式' }}</button>
            <button class="secondary" @click="exportJson">导出提交</button>
            <button class="primary" @click="runTests">▶ 提交评测</button>
          </div>
        </div>
        <section v-if="problem.lesson" :key="problem.id" class="lesson-card">
          <div class="eyebrow">LEARN BY DOING · 一次只学一个知识点</div>
          <h3>先看懂，再动手</h3>
          <p>{{ problem.lesson.concept }}</p>
          <ol><li v-for="step in problem.lesson.steps" :key="step">{{ step }}</li></ol>
          <div class="eyebrow">举个别的例子</div>
          <pre>{{ problem.lesson.example }}</pre>
          <button class="secondary" :aria-expanded="showSolution" @click="showSolution = !showSolution">{{ showSolution ? '收起参考答案' : '还是不会？查看参考答案' }}</button>
          <div v-if="showSolution" class="lesson-solution"><p>可以照着输入一次，再试着说出每一行的作用。不会因此扣分。</p><pre>{{ problem.lesson.solution }}</pre></div>
        </section>
        <div v-show="!sourceMode" ref="host" class="editor-host"></div>
        <div v-show="sourceMode" class="source-wrap">
          <div class="source-label">PlantUML ↔ 可视化类图 · 切换模式时同步</div>
          <textarea v-model="source" spellcheck="false" aria-label="PlantUML source"></textarea>
          <details class="source-note"><summary>查看语法提示（不是本题答案）</summary>
            <pre>class Example {
  - code: String
}
Example "1" -- "0..*" OtherExample</pre>
            <p>请显式声明所有类；目前支持基础类图语法，不支持完整 PlantUML。双引号中的数字是该端多重性。</p>
          </details>
        </div>
        <div class="statusbar"><span class="live-dot"></span>{{ notice }}</div>
        <section v-if="error" class="results error-report" role="alert"><h2>INPUT ERROR</h2><pre>{{ error }}</pre></section>
        <section v-if="results" class="results" aria-live="polite">
          <div class="result-head">
            <div><div class="eyebrow">JUDGE REPORT</div><h2>{{ problem.title }} · 评测报告</h2></div>
            <div class="score"><strong>{{ passed }}/{{ results.length }}</strong><span>测试通过</span></div>
          </div>
          <div v-for="r in results" :key="r.id" class="result-row">
            <span class="result-icon" :class="r.passed ? 'ok' : 'fail'">{{ r.passed ? '✓' : '×' }}</span>
            <div class="result-copy"><b>{{ r.title }}</b><small>{{ r.detail }}</small></div>
            <span class="result-state" :class="r.passed ? 'ok' : 'fail'">{{ r.passed ? 'PASS' : 'FAIL' }}</span>
          </div>
          <div class="verdict" :class="accepted ? 'accepted' : 'wrong'">{{ problem.lesson ? (accepted ? '✓ 本关通过！' : '再试一下，下面还有提示') : (accepted ? 'ACCEPTED' : 'WRONG ANSWER') }}</div>
          <div v-if="accepted && problem.lesson" class="lesson-complete">
            <p>{{ problem.lesson.takeaway }}</p>
            <button v-if="nextProblem" class="primary" @click="openProblem(nextProblem.id)">进入下一关 →</button>
            <div v-else><b>全部教学已完成。</b><p>想独立练习时，可以从顶部的“正式挑战”进入题库；也可以留在这里复习。</p></div>
          </div>
        </section>
      </section>
    </main>
    <footer>UML OJ · TEST YOUR MODEL, NOT YOUR MEMORY <span>Powered by Apollon · MIT</span></footer>
  </div>
</template>
