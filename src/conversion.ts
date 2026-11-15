import type { UMLModel } from '@tumaet/apollon'

// Loss-checked interchange subset. Every source statement is consumed; unlike
// the permissive upstream parser, unsupported syntax cannot disappear silently.
export type ClassModel = { name: string; abstract: boolean; attributes: string[]; methods: string[] }
export type RelationModel = {
  source: string; target: string; type: string; label: string
  sourceMultiplicity: string; targetMultiplicity: string
}
export type Diagram = { classes: ClassModel[]; relations: RelationModel[] }
const arrows: Record<string, [string, boolean]> = {
  '--': ['ClassBidirectional', false], '-->': ['ClassUnidirectional', false], '<--': ['ClassUnidirectional', true],
  '--|>': ['ClassInheritance', false], '<|--': ['ClassInheritance', true],
  '..>': ['ClassDependency', false], '<..': ['ClassDependency', true],
  '..|>': ['ClassRealization', false], '<|..': ['ClassRealization', true],
  '--o': ['ClassAggregation', false], 'o--': ['ClassAggregation', true],
  '--*': ['ClassComposition', false], '*--': ['ClassComposition', true],
}
const outputArrows: Record<string, string> = Object.fromEntries(Object.entries(arrows).filter(([, [, reverse]]) => !reverse).map(([arrow, [type]]) => [type, arrow]))
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/
function fail(message: string): never { throw new Error(`${message} 原内容已保留，请修正后再切换。`) }
function validate(diagram: Diagram) {
  const names = new Set<string>()
  for (const c of diagram.classes) {
    if (!identifier.test(c.name)) fail(`暂不能转换类名“${c.name}”：请使用英文标识符（字母、数字、下划线，不能以数字开头）。`)
    if (names.has(c.name.toLowerCase())) fail(`类名 ${c.name} 重复，无法确定关系端点。`)
    names.add(c.name.toLowerCase())
    if (c.attributes.some(m => /[()]/.test(m)) || c.methods.some(m => !m.includes('(') || !m.includes(')'))) fail(`类 ${c.name} 的属性或方法格式有误：属性不应有圆括号，方法必须有圆括号。`)
    for (const member of [...c.attributes, ...c.methods]) {
      if (!member.trim() || /[{}\r\n"';]/.test(member) || member.trim().startsWith('@')) fail(`暂不能转换成员“${member}”：不支持花括号修饰符、多行或指令。`)
    }
  }
  const exactNames = new Set(diagram.classes.map(c => c.name))
  for (const e of diagram.relations) {
    if (!exactNames.has(e.source) || !exactNames.has(e.target)) fail(`关系 ${e.source} → ${e.target} 的端点未声明为类。`)
    if (!outputArrows[e.type]) fail(`暂不支持关系类型 ${e.type}。`)
    if (/["\r\n]/.test(e.sourceMultiplicity + e.targetMultiplicity) || /[\r\n'{}]/.test(e.label)) fail('多重性或关系名称包含暂不支持的字符。')
  }
}

// Break braces into statements while leaving quoted multiplicities untouched.
function statements(text: string): string[] {
  const result: string[] = []
  let current = '', quoted = false, comment = false
  for (const char of text) {
    if (char === '\n') { if (current.trim()) result.push(current.trim()); current = ''; comment = false; continue }
    if (comment || char === '\r') continue
    if (char === '"') quoted = !quoted
    if (char === "'" && !quoted) { comment = true; continue }
    if (!quoted && (char === '{' || char === '}')) {
      if (current.trim()) result.push(current.trim())
      result.push(char); current = ''
    } else current += char
  }
  if (quoted) fail('双引号没有配对。')
  if (current.trim()) result.push(current.trim())
  return result
}

export function parseSource(text: string): Diagram {
  const tokens = statements(text)
  if (tokens[0] !== '@startuml' || tokens[tokens.length - 1] !== '@enduml') fail('转换需要一个以 @startuml 开始、@enduml 结束的类图。')
  const diagram: Diagram = { classes: [], relations: [] }
  let body: ClassModel | null = null
  const lines = tokens.slice(1, -1)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (body) {
      if (line === '}') { body = null; continue }
      if (line === '{' || /^(class|interface|enum|abstract|@)\b/.test(line)) fail(`无法转换类中的内容：${line}`)
      if ((line.match(/\(/g)?.length ?? 0) !== (line.match(/\)/g)?.length ?? 0)) fail(`方法括号未配对：${line}`)
      ;(line.includes('(') ? body.methods : body.attributes).push(line)
      continue
    }
    const declaration = /^(abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(line)
    if (declaration) {
      const c: ClassModel = { name: declaration[2], abstract: !!declaration[1], attributes: [], methods: [] }
      diagram.classes.push(c)
      if (lines[i + 1] === '{') { body = c; i++ }
      continue
    }
    const relation = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:"([^"\n]*)"\s*)?(<\|--|--\|>|<\|\.\.|\.\.\|>|<--|-->|<\.\.|\.\.>|o--|--o|\*--|--\*|--)\s*(?:"([^"\n]*)"\s*)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*(.*))?$/.exec(line)
    if (!relation) fail(`暂不支持这行语法：${line}。可转换普通类、属性、方法及基础关系；暂不支持别名、接口、枚举、包、注解或样式指令。`)
    const [, left, leftMultiplicity = '', arrow, rightMultiplicity = '', right, label = ''] = relation
    const [type, reverse] = arrows[arrow]
    diagram.relations.push({ source: reverse ? right : left, target: reverse ? left : right, type, label,
      sourceMultiplicity: reverse ? rightMultiplicity : leftMultiplicity, targetMultiplicity: reverse ? leftMultiplicity : rightMultiplicity })
  }
  if (body) fail(`类 ${body.name} 缺少右花括号。`)
  validate(diagram)
  return diagram
}

export function serializeSource(diagram: Diagram): string {
  validate(diagram)
  const classes = diagram.classes.map(c => {
    const header = `${c.abstract ? 'abstract ' : ''}class ${c.name}`
    const members = [...c.attributes, ...c.methods]
    return members.length ? `${header} {\n${members.map(m => `  ${m}`).join('\n')}\n}` : header
  })
  const relations = diagram.relations.map(e => `${e.source}${e.sourceMultiplicity ? ` "${e.sourceMultiplicity}"` : ''} ${outputArrows[e.type]} ${e.targetMultiplicity ? `"${e.targetMultiplicity}" ` : ''}${e.target}${e.label ? ` : ${e.label}` : ''}`)
  return ['@startuml', ...classes, ...relations, '@enduml'].join('\n')
}

export function readVisual(model: UMLModel): Diagram {
  const names = new Map(model.nodes.map(n => [n.id, String(n.data?.name ?? '')]))
  const classes = model.nodes.map(n => {
    if (n.type !== 'class' || n.data?.isInterface || n.data?.isEnum || n.data?.stereotype) fail('画布中包含接口、枚举、构造型或非类节点，暂不能无损转换。')
    const members = (key: string) => ((n.data?.[key] ?? []) as (string | { name: string; tags?: unknown[] })[]).map(m => {
      if (typeof m === 'string') return m
      if (m.tags?.length) fail('成员标签暂不能转换为 PlantUML。')
      return m.name
    })
    return { name: String(n.data?.name ?? ''), abstract: !!n.data?.isAbstract, attributes: members('attributes'), methods: members('methods') }
  })
  const relations = model.edges.map(e => {
    if (e.data?.sourceRole || e.data?.targetRole) fail('关联端角色名暂不能转换，请保留在画布中，或先清空端点角色名再切换。关系名称和多重性可以转换。')
    return { source: names.get(e.source) ?? '', target: names.get(e.target) ?? '', type: e.type,
      label: String(e.data?.label ?? ''), sourceMultiplicity: String(e.data?.sourceMultiplicity ?? ''), targetMultiplicity: String(e.data?.targetMultiplicity ?? '') }
  })
  const diagram = { classes, relations }
  validate(diagram)
  return diagram
}

export function toVisual(diagram: Diagram, previous: UMLModel): UMLModel {
  validate(diagram)
  const previousNames = new Map(previous.nodes.filter(n => n.type === 'class').map(n => [String(n.data?.name), n]))
  const nodes = diagram.classes.map((c, index) => {
    const old = previousNames.get(c.name)
    const width = Math.max(240, (Math.max(c.name.length, ...c.attributes.map(m => m.length), ...c.methods.map(m => m.length)) + 4) * 8)
    const height = 100 + (c.attributes.length + c.methods.length) * 30
    const usedMembers = new Set<string>()
    const members = (values: string[], key: string) => values.map(name => {
      const existing = (old?.data?.[key] as { id: string; name: string }[] | undefined)?.find(m => m.name === name && !usedMembers.has(m.id))
      const id = existing?.id ?? crypto.randomUUID()
      usedMembers.add(id)
      return { ...existing, id, name }
    })
    return { ...old, id: old?.id ?? crypto.randomUUID(), type: 'class' as const,
      position: old?.position ?? { x: 80 + index % 3 * 320, y: 80 + Math.floor(index / 3) * 300 },
      width, height, measured: { width, height },
      data: { ...old?.data, name: c.name, isAbstract: c.abstract, attributes: members(c.attributes, 'attributes'), methods: members(c.methods, 'methods') },
    }
  })
  const ids = new Map(nodes.map(n => [n.data.name, n.id]))
  const used = new Set<string>()
  const edges = diagram.relations.map(e => {
    const source = ids.get(e.source)!, target = ids.get(e.target)!
    const old = previous.edges.find(candidate => !used.has(candidate.id) && candidate.source === source && candidate.target === target && candidate.type === e.type)
    if (old) used.add(old.id)
    return { ...old, id: old?.id ?? crypto.randomUUID(), source, target, type: e.type as UMLModel['edges'][number]['type'],
      sourceHandle: old?.sourceHandle ?? 'right', targetHandle: old?.targetHandle ?? 'left',
      data: { ...old?.data, points: old?.data.points ?? [], label: e.label, sourceMultiplicity: e.sourceMultiplicity, targetMultiplicity: e.targetMultiplicity },
    }
  })
  return { ...previous, nodes, edges }
}

// Exclude layout and generated IDs, so merely moving nodes preserves the user's
// original source (including comments and formatting) when switching back.
export function semanticKey(model: UMLModel): string {
  return JSON.stringify(readVisual(model))
}
