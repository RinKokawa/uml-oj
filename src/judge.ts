import type { Problem } from './problems'
import type { Diagram } from './uml/model'

export type TestResult = { id: string; title: string; passed: boolean; detail: string }
export type Model = {
  classes: { name: string; attributes: string[]; methods?: string[]; kind?: 'interface' }[]
  relations: { source: string; target: string; association: boolean; sourceMultiplicity: string; targetMultiplicity: string }[]
}
const normalize = (text: string) => text.trim().toLowerCase()
const attributeName = (value: string) => value.replace(/^\s*[-+#~]\s*/, '').split(':')[0].trim()
const methodName = (value: string) => value.replace(/^\s*[-+#~]\s*/, '').split('(')[0].trim()

export function fromDiagram(diagram: Diagram): Model {
  return {
    classes: diagram.classes.map(c => ({ name: c.name, attributes: c.attributes.map(attributeName), methods: c.methods.map(methodName), ...(c.kind === 'interface' ? { kind: 'interface' as const } : {}) })),
    relations: diagram.relations.map(r => ({ source: r.source, target: r.target,
      association: ['ClassBidirectional', 'ClassUnidirectional'].includes(r.type),
      sourceMultiplicity: r.sourceMultiplicity, targetMultiplicity: r.targetMultiplicity })),
  }
}

export function judge(model: Model, problem: Problem): TestResult[] {
  const results: TestResult[] = []
  const check = (id: string, title: string, passed: boolean, failure: string) => {
    results.push({ id, title, passed, detail: passed ? '满足要求。' : failure })
  }
  for (const required of problem.classes) {
    const matches = model.classes.filter(c => c.kind !== 'interface' && normalize(c.name) === normalize(required.name))
    check(`class-${required.name}`, `存在 ${required.name} 类`, matches.length === 1, `需要且只能有一个名为 ${required.name} 的类。`)
    for (const attr of required.attributes) {
      check(`attr-${required.name}-${attr}`, `${required.name} 包含属性 ${attr}`,
        matches.length === 1 && matches[0].attributes.some(a => normalize(a) === normalize(attr)),
        `请在 ${required.name} 类中添加属性 ${attr}（不是方法）。`)
    }
  }
  for (const required of problem.interfaces ?? []) {
    const matches = model.classes.filter(c => c.kind === 'interface' && normalize(c.name) === normalize(required.name))
    check(`interface-${required.name}`, `存在 ${required.name} 接口`, matches.length === 1, `需要且只能有一个名为 ${required.name} 的接口；普通类不能代替接口。`)
    for (const method of required.methods) {
      check(`method-${required.name}-${method}`, `${required.name} 包含方法 ${method}`,
        matches.length === 1 && (matches[0].methods ?? []).some(m => normalize(m) === normalize(method)),
        `请在 ${required.name} 接口中添加方法 ${method}；属性不能代替方法。`)
    }
  }
  const multiplicity = (s: string) => s.replace(/\s/g, '').replace(/^\*$/, '0..*').replace(/^1\.\.1$/, '1')
  const edgesBetween = (a: string, b: string) =>
    model.relations.flatMap(e => {
      if (normalize(e.source) === normalize(a) && normalize(e.target) === normalize(b)) return [e]
      if (normalize(e.source) === normalize(b) && normalize(e.target) === normalize(a)) return [{ ...e, sourceMultiplicity: e.targetMultiplicity, targetMultiplicity: e.sourceMultiplicity }]
      return []
    })
  const hasMultiplicities = (edge: Model['relations'][number], a: string, b: string) =>
    multiplicity(edge.sourceMultiplicity) === a && multiplicity(edge.targetMultiplicity) === b
  for (const [a, b, ma, mb] of problem.relations) {
    const edges = edgesBetween(a, b).filter(e => e.association)
    check(`rel-${a}-${b}`, `${a} 与 ${b} 存在普通关联`, edges.length > 0, `请使用普通关联连接 ${a} 与 ${b}，继承、依赖、聚合或组合不能替代。`)
    if (ma === null || mb === null) continue
    check(`mult-${a}-${b}`,  `${a} 端 ${ma}，${b} 端 ${mb}`,
      edges.some(e => hasMultiplicities(e, ma, mb)),
      `请在同一条普通关联的 ${a} 端填写 ${ma}，${b} 端填写 ${mb}。`)
  }
  if (problem.relationAlternatives) {
    const { id, title, failure, options } = problem.relationAlternatives
    const isClass = (name: string) =>
      model.classes.filter(c => c.kind !== 'interface' && normalize(c.name) === normalize(name)).length === 1
    const passed = options.some(option =>
      option.absent.every(([a, b]) => edgesBetween(a, b).length === 0) &&
      option.relations.every(([a, b, ma, mb]) => {
        const [edge, ...extra] = edgesBetween(a, b)
        return isClass(a) && isClass(b) && !!edge && !extra.length && edge.association && hasMultiplicities(edge, ma, mb)
      }),
    )
    check(id, title, passed, failure)
  }
  return results
}
