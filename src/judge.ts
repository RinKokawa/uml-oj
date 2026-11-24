import type { Problem } from './problems'
import type { Diagram } from './uml/model'

export type TestResult = { id: string; title: string; passed: boolean; detail: string }
export type Model = {
  classes: { name: string; attributes: string[]; methods?: string[]; kind?: 'interface' }[]
  relations: { source: string; target: string; type: string; label: string; association: boolean; sourceMultiplicity: string; targetMultiplicity: string }[]
}
const normalize = (text: string) => text.trim().toLowerCase()
const attributeName = (value: string) => value.replace(/^\s*[-+#~]\s*/, '').split(':')[0].trim()
const methodName = (value: string) => value.replace(/^\s*[-+#~]\s*/, '').split('(')[0].trim()

export function fromDiagram(diagram: Diagram): Model {
  return {
    classes: diagram.classes.map(c => ({ name: c.name, attributes: c.attributes.map(attributeName), methods: c.methods.map(methodName), ...(c.kind === 'interface' ? { kind: 'interface' as const } : {}) })),
    relations: diagram.relations.map(r => ({ source: r.source, target: r.target, type: r.type, label: r.label,
      association: ['ClassBidirectional', 'ClassUnidirectional'].includes(r.type),
      sourceMultiplicity: r.sourceMultiplicity, targetMultiplicity: r.targetMultiplicity })),
  }
}

export function judge(model: Model, problem: Problem): TestResult[] {
  if (problem.referenceOnly) throw new Error('这道原题暂不支持自动评测。')
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
  for (const relation of problem.typedRelations ?? []) {
    const typeName = relation.type === 'ClassInheritance' ? '继承' : '实现'
    const matched = model.relations.some(e => e.type === relation.type && normalize(e.source) === normalize(relation.source) && normalize(e.target) === normalize(relation.target))
    check(`typed-${relation.type}-${relation.source}-${relation.target}`, `${relation.source} ${typeName} ${relation.target}`, matched,
      `请添加从 ${relation.source} 指向 ${relation.target} 的${typeName}关系，注意关系类型和方向。`)
  }

  const multiplicity = (s: string) => s.replace(/\s/g, '').replace(/^\*$/, '0..*').replace(/^1\.\.1$/, '1')
  const edgesBetween = (a: string, b: string) =>
    model.relations.flatMap(e => {
      if (normalize(e.source) === normalize(a) && normalize(e.target) === normalize(b)) return [e]
      if (normalize(e.source) === normalize(b) && normalize(e.target) === normalize(a)) return [{ ...e, sourceMultiplicity: e.targetMultiplicity, targetMultiplicity: e.sourceMultiplicity }]
      return []
    })
  const hasMultiplicities = (edge: Model['relations'][number], a: string, b: string) =>
    multiplicity(edge.sourceMultiplicity) === multiplicity(a) && multiplicity(edge.targetMultiplicity) === multiplicity(b)

  for (const required of problem.namedRelations ?? []) {
    const edges = model.relations.flatMap(e => {
      if (!e.association || normalize(e.label) !== normalize(required.label)) return []
      if (normalize(e.source) === normalize(required.source) && normalize(e.target) === normalize(required.target)) return [e]
      if (e.type === 'ClassBidirectional' && normalize(e.source) === normalize(required.target) && normalize(e.target) === normalize(required.source)) return [{ ...e, sourceMultiplicity: e.targetMultiplicity, targetMultiplicity: e.sourceMultiplicity }]
      return []
    })
    const found = edges.some(e => (!required.sourceMultiplicity || multiplicity(e.sourceMultiplicity) === multiplicity(required.sourceMultiplicity)) && (!required.targetMultiplicity || multiplicity(e.targetMultiplicity) === multiplicity(required.targetMultiplicity)))
    const counts = [required.sourceMultiplicity ? `${required.source} 端 ${required.sourceMultiplicity}` : '', required.targetMultiplicity ? `${required.target} 端 ${required.targetMultiplicity}` : ''].filter(Boolean).join('、')
    check(`named-${required.source}-${required.target}-${required.label}`, `${required.source} 与 ${required.target} 的 ${required.label} 关联${counts ? `（${counts}）` : ''}`, found,
      `请添加 ${required.source} 与 ${required.target} 的普通关联，关系名称为 ${required.label}${counts ? `；${counts}` : ''}。有方向的关联应从 ${required.source} 指向 ${required.target}。`)
  }

  for (const [a, b, ma, mb] of problem.relations) {
    const edges = edgesBetween(a, b).filter(e => e.association)
    check(`rel-${a}-${b}`, `${a} 与 ${b} 存在普通关联`, edges.length > 0, `请使用普通关联连接 ${a} 与 ${b}，继承、依赖、聚合或组合不能替代。`)
    if (ma === null && mb === null) continue
    const counts = [ma === null ? '' : `${a} 端 ${ma}`, mb === null ? '' : `${b} 端 ${mb}`].filter(Boolean).join('，')
    check(`mult-${a}-${b}`, counts,
      edges.some(e => (ma === null || multiplicity(e.sourceMultiplicity) === multiplicity(ma)) && (mb === null || multiplicity(e.targetMultiplicity) === multiplicity(mb))),
      `请在同一条普通关联的 ${counts.replaceAll('端 ', '端填写 ')}。`)
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
