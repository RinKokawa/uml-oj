<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import { ApollonEditor, UMLDiagramType } from '@tumaet/apollon'
import type { UMLModel } from '@tumaet/apollon'
import '@tumaet/apollon/style.css'

type TestResult = { id: string; title: string; passed: boolean; detail: string }
const host = ref<HTMLDivElement | null>(null)
const editor = ref<InstanceType<typeof ApollonEditor> | null>(null)
const modelJson = ref('')
const results = ref<TestResult[] | null>(null)
const sourceMode = ref(false)
const source = ref(`@startuml
class Developer {
  - name: String
  - employeeId: String
}
class Project {
  - name: String
  - startDate: Date
}
Developer "0..*" -- "0..*" Project : participates
Developer "0..*" -- "1" Project : leads
@enduml`)
const notice = ref('在画布中创建类、添加属性并连接关系，然后提交运行测试。')
const passed = computed(() => results.value?.filter(x => x.passed).length ?? 0)

function getModel(): any {
  if (sourceMode.value) return parsePlantUmlSubset(source.value)
  return editor.value?.model ?? null
}

// A deliberately small, transparent PlantUML subset for this first playable exercise.
// Unsupported syntax is reported rather than silently accepted.
function parsePlantUmlSubset(text: string) {
  const classes: Array<{name:string; attributes:string[]}> = []
  const relations: Array<{source:string; target:string; label:string; multiplicity:string; arrow:string}> = []
  const lines = text.split(/\r?\n/)
  let current: {name:string; attributes:string[]} | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("'") || line.startsWith('@') || line === '}') { if (line === '}') current = null; continue }
    const decl = line.match(/^(?:abstract\s+)?class\s+([\w.]+)\s*(\{)?$/)
    if (decl) { current = {name:decl[1], attributes:[]}; classes.push(current); continue }
    if (current && !line.includes('--') && !line.includes('<|') && !line.includes('..>')) { current.attributes.push(line.replace(/^[-+#~]\s*/, '').split(':')[0].trim()); continue }
    const rel = line.match(/^(\w+)\s+(?:"([^"]+)"\s*)?(<\|--|--\|>|\*--|--\*|o--|--o|\.\.>|--|\.\.)(?:\s*"([^"]+)"\s*)?\s+(\w+)(?:\s*:\s*(.+))?$/)
    if (rel) relations.push({source:rel[1], multiplicity:rel[2] ?? '', arrow:rel[3], label:rel[6] ?? '', target:rel[5]})
  }
  return { classes, relations, raw:text }
}

function runTests() {
  const model = getModel()
  const tests: TestResult[] = []
  if (!model) {
    results.value = [{id:'PARSE', title:'读取模型', passed:false, detail:'编辑器尚未初始化或输入为空。'}]
    return
  }
  let classes: any[] = []
  let edges: any[] = []
  if (sourceMode.value) {
    classes = model.classes
    edges = model.relations
  } else {
    const nodes = Array.isArray(model.nodes) ? model.nodes : []
    classes = nodes.filter((n:any) => /class/i.test(String(n.type ?? '')) || (n.data && Array.isArray(n.data.attributes) && Array.isArray(n.data.methods)))
    edges = Array.isArray(model.edges) ? model.edges : []
  }
  const names = classes.map((n:any) => sourceMode.value ? n.name : n.data?.name).filter(Boolean)
  const required = ['Developer', 'Project']
  for (const name of required) {
    const exists = names.some((n:string) => n.toLowerCase() === name.toLowerCase())
    tests.push({id:`CLASS-${name.toUpperCase()}`, title:`存在 ${name} 类`, passed:exists, detail:exists ? `找到 ${name}。` : `未找到名为 ${name} 的类。`})
  }
  const attrExists = (className:string, attr:string) => classes.some((n:any) => {
    const name = sourceMode.value ? n.name : n.data?.name
    const attrs = sourceMode.value ? n.attributes : (n.data?.attributes ?? []).map((a:any) => a.name)
    return name?.toLowerCase() === className.toLowerCase() && attrs.some((a:string) => a.toLowerCase() === attr.toLowerCase())
  })
  for (const [c,a] of [['Developer','name'],['Developer','employeeId'],['Project','name'],['Project','startDate']]) {
    const ok = attrExists(c,a)
    tests.push({id:`ATTR-${c}-${a}`, title:`${c} 包含属性 ${a}`, passed:ok, detail:ok ? '属性存在。' : `请在 ${c} 中添加属性 ${a}。`})
  }
  const hasPair = (a:string,b:string) => edges.some((e:any) => {
    if (sourceMode.value) return (e.source===a && e.target===b)||(e.source===b && e.target===a)
    const ids = new Map(classes.map((n:any)=>[n.id,n.data?.name]))
    const x=ids.get(e.source), y=ids.get(e.target)
    return (x===a&&y===b)||(x===b&&y===a)
  })
  const relationOk = hasPair('Developer','Project')
  tests.push({id:'REL-PARTICIPATION', title:'Developer 与 Project 存在关联', passed:relationOk, detail:relationOk ? '检测到两类之间的连线。' : '请连接 Developer 和 Project。'})
  results.value = tests
  notice.value = '评测完成。当前关卡使用基础结构测试，后续会扩展关系类型、多重性与约束测试。'
}

function switchMode() {
  sourceMode.value = !sourceMode.value
  results.value = null
  notice.value = sourceMode.value ? '源码模式仅支持当前关卡所需的 PlantUML 类声明、属性和关联子集。' : '可视化编辑由 Apollon 提供。'
}
function exportJson() {
  const data = getModel()
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download='uml-oj-submission.json'; a.click()
  URL.revokeObjectURL(url)
}
onMounted(() => {
  if (!host.value) return
  editor.value = new ApollonEditor(host.value, { type: UMLDiagramType.ClassDiagram })
  editor.value.subscribeToModelChange((model: UMLModel) => {
    modelJson.value = JSON.stringify(model, null, 2)
    results.value = null
  })
  modelJson.value = JSON.stringify(editor.value.model, null, 2)
})
onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#"><span class="brand-mark">U</span><span>UML <b>OJ</b></span></a>
      <div class="top-meta"><span class="live-dot"></span> 本地练习 · 无需登录 <span class="version">PREVIEW 0.1</span></div>
    </header>
    <main class="layout">
      <aside class="problem-panel">
        <div class="eyebrow">CLASS DIAGRAM · LEVEL 01</div>
        <h1>项目管理系统</h1>
        <p class="lead">根据以下业务需求，绘制 UML 类图。完成后提交，系统将逐项执行测试用例。</p>
        <section class="statement">
          <h2>业务需求</h2>
          <ol>
            <li>系统包含开发者和项目两种核心实体。</li>
            <li>开发者具有姓名 <code>name</code> 和工号 <code>employeeId</code>。</li>
            <li>项目具有名称 <code>name</code> 和开始日期 <code>startDate</code>。</li>
            <li>开发者可以参与多个项目，一个项目也可以有多个开发者。</li>
          </ol>
        </section>
        <section class="statement tests-info">
          <h2>评测点</h2>
          <div class="test-line"><span>01</span> Developer 类存在</div>
          <div class="test-line"><span>02</span> Project 类存在</div>
          <div class="test-line"><span>03</span> 四个指定属性存在</div>
          <div class="test-line"><span>04</span> 两个类之间存在关联</div>
        </section>
        <div class="hint"><b>提示</b><br>先建立两个类，再添加属性，最后用关联线连接它们。布局不参与评分。</div>
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
        <div v-if="!sourceMode" ref="host" class="editor-host"></div>
        <div v-else class="source-wrap">
          <div class="source-label">PlantUML · 当前支持类、属性和关联的基础语法</div>
          <textarea v-model="source" spellcheck="false" aria-label="PlantUML source"></textarea>
          <div class="source-note">此版本使用受限语法解析器；不支持的 PlantUML 语法不会被完整识别。</div>
        </div>
        <div class="statusbar"><span class="live-dot"></span>{{ notice }}</div>
        <section v-if="results" class="results">
          <div class="result-head">
            <div><div class="eyebrow">JUDGE REPORT</div><h2>评测报告</h2></div>
            <div class="score"><strong>{{ passed }}/{{ results.length }}</strong><span>测试通过</span></div>
          </div>
          <div v-for="r in results" :key="r.id" class="result-row">
            <span class="result-icon" :class="r.passed ? 'ok' : 'fail'">{{ r.passed ? '✓' : '×' }}</span>
            <div class="result-copy"><b>{{ r.title }}</b><small>{{ r.detail }}</small></div>
            <span class="result-state" :class="r.passed ? 'ok' : 'fail'">{{ r.passed ? 'PASS' : 'FAIL' }}</span>
          </div>
          <div class="verdict" :class="passed===results.length ? 'accepted' : 'wrong'">{{ passed===results.length ? 'ACCEPTED' : 'WRONG ANSWER' }}</div>
        </section>
      </section>
    </main>
    <footer>UML OJ · TEST YOUR MODEL, NOT YOUR MEMORY <span>Powered by Apollon · MIT</span></footer>
  </div>
</template>