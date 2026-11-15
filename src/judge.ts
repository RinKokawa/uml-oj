// Import the standalone PEG grammar: the package root also loads Node-only CLI utilities.
import { parse } from 'plantuml-parser/dist/plantuml.js'
import type { Problem } from './problems'

export type TestResult = { id: string; title: string; passed: boolean; detail: string }
export type Model = {
  classes: { name: string; attributes: string[] }[]
  relations: { source: string; target: string; association: boolean; sourceMultiplicity: string; targetMultiplicity: string }[]
}
const normalize = (text: string) => text.trim().toLowerCase()
const attributeName = (value: string) => value.replace(/^\s*[-+#~]\s*/, '').split(':')[0].trim()

export function fromPlantUml(text: string): Model {
  if (!text.trim()) throw new Error('请输入 PlantUML 源码。')
  if (!/^\s*@startuml\b/m.test(text) || !/^\s*@enduml\s*$/m.test(text)) throw new Error('请使用 @startuml 和 @enduml 包围类图。')
  const syntax = text.replace(/'.*$/gm, '').replace(/"[^"\n]*"/g, '""')
  if (/^\s*class\s*(?:\{|$)/m.test(syntax) || (syntax.match(/\{/g)?.length ?? 0) !== (syntax.match(/\}/g)?.length ?? 0)) {
    throw new Error('类声明不完整，请检查类名和花括号是否配对。')
  }
  const diagrams = parse(text) as any[]
  if (diagrams.length !== 1) throw new Error('请提交一个 @startuml / @enduml 类图。')
  const elements = diagrams[0].elements ?? []
  return {
    classes: elements.filter((e: any) => typeof e.name === 'string' && Array.isArray(e.members) && Object.hasOwn(e, 'isAbstract'))
      .map((e: any) => ({ name: e.name, attributes: e.members
        .filter((m: any) => !m.isMethod && !Object.hasOwn(m, '_arguments') && !Object.hasOwn(m, 'returnType') && !String(m.name ?? m.title ?? '').includes('('))
        .map((m: any) => attributeName(String(m.name ?? m.title ?? ''))) })),
    relations: elements.filter((e: any) => typeof e.left === 'string' && typeof e.right === 'string')
      .map((e: any) => ({ source: e.left, target: e.right,
        association: !/[o*|]/.test(`${e.leftArrowHead}${e.rightArrowHead}`) && `${e.leftArrowBody}${e.rightArrowBody}`.includes('-') && !`${e.leftArrowBody}${e.rightArrowBody}`.includes('.'),
        sourceMultiplicity: e.leftCardinality ?? '', targetMultiplicity: e.rightCardinality ?? '' })),
  }
}

export function fromVisual(model: any): Model {
  const nodes = (model.nodes ?? []).filter((n: any) => n.type === 'class' && !n.data?.isInterface && !n.data?.isEnum)
  const names = new Map(nodes.map((n: any) => [n.id, n.data?.name ?? '']))
  return {
    classes: nodes.map((n: any) => ({ name: n.data?.name ?? '', attributes: (n.data?.attributes ?? [])
      .map((a: any) => attributeName(typeof a === 'string' ? a : a.name ?? '')) })),
    relations: (model.edges ?? []).map((e: any) => ({ source: names.get(e.source) ?? '', target: names.get(e.target) ?? '',
      association: ['ClassBidirectional', 'ClassUnidirectional'].includes(e.type),
      sourceMultiplicity: e.data?.sourceMultiplicity ?? '', targetMultiplicity: e.data?.targetMultiplicity ?? '' })),
  }
}

export function judge(model: Model, problem: Problem): TestResult[] {
  const results: TestResult[] = []
  const check = (id: string, title: string, passed: boolean, failure: string) => {
    results.push({ id, title, passed, detail: passed ? '满足要求。' : failure })
  }
  for (const required of problem.classes) {
    const matches = model.classes.filter(c => normalize(c.name) === normalize(required.name))
    check(`class-${required.name}`, `存在 ${required.name} 类`, matches.length === 1, `需要且只能有一个名为 ${required.name} 的类。`)
    for (const attr of required.attributes) {
      check(`attr-${required.name}-${attr}`, `${required.name} 包含属性 ${attr}`,
        matches.length === 1 && matches[0].attributes.some(a => normalize(a) === normalize(attr)),
        `请在 ${required.name} 类中添加属性 ${attr}（不是方法）。`)
    }
  }
  const multiplicity = (s: string) => s.replace(/\s/g, '').replace(/^\*$/, '0..*').replace(/^1\.\.1$/, '1')
  for (const [a, b, ma, mb] of problem.relations) {
    const edges = model.relations.flatMap(e => {
      if (!e.association) return []
      if (normalize(e.source) === normalize(a) && normalize(e.target) === normalize(b)) return [e]
      if (normalize(e.source) === normalize(b) && normalize(e.target) === normalize(a)) return [{ ...e, sourceMultiplicity: e.targetMultiplicity, targetMultiplicity: e.sourceMultiplicity }]
      return []
    })
    check(`rel-${a}-${b}`, `${a} 与 ${b} 存在普通关联`, edges.length > 0, `请使用普通关联连接 ${a} 与 ${b}，继承、依赖、聚合或组合不能替代。`)
    if (ma === null || mb === null) continue
    check(`mult-${a}-${b}`,  `${a} 端 ${ma}，${b} 端 ${mb}`,
      edges.some(e => multiplicity(e.sourceMultiplicity) === ma && multiplicity(e.targetMultiplicity) === mb),
      `请在同一条普通关联的 ${a} 端填写 ${ma}，${b} 端填写 ${mb}。`)
  }
  return results
}
