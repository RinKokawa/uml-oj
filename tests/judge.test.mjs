import test from 'node:test'
import assert from 'node:assert/strict'
import { fromDiagram, judge } from '../src/judge.ts'
import { parsePlantUml } from '../src/uml/adapters/plantuml.ts'
import { parseMermaid, toMermaid } from '../src/uml/adapters/mermaid.ts'
const fromPlantUml = text => fromDiagram(parsePlantUml(text))
import { problems, emptySource } from '../src/problems.ts'

function answer(problem, additions = []) {
  const ordinary = problem.relations.map(([a,b,ma,mb]) => `${a}${ma === null ? '' : ` "${ma}"`} -- ${mb === null ? '' : `"${mb}" `}${b}`)
  const typed = (problem.typedRelations ?? []).map(r => `${r.source} ${r.type === 'ClassInheritance' ? '--|>' : '..|>'} ${r.target}`)
  const named = (problem.namedRelations ?? []).map(r => `${r.source}${r.sourceMultiplicity ? ` "${r.sourceMultiplicity}"` : ''} -- ${r.targetMultiplicity ? `"${r.targetMultiplicity}" ` : ''}${r.target} : ${r.label}`)
  return '@startuml\n' + problem.classes.map(c => `class ${c.name} {\n${c.attributes.map(a => `- ${a}: String`).join('\n')}\n}`).join('\n') + '\n' + [...ordinary, ...typed, ...named, ...additions].join('\n') + '\n@enduml'
}
for (const problem of problems.filter(p => !p.lesson && !p.referenceOnly && !p.relationAlternatives)) {
  test(`${problem.id}: correct source passes, empty source fails`, () => {
    assert.ok(judge(fromPlantUml(answer(problem)), problem).every(r => r.passed))
    assert.ok(judge(fromPlantUml(emptySource), problem).every(r => !r.passed))
  })
  test(`${problem.id}: wrong ordinary relation type fails`, () => {
    const model = fromPlantUml(answer(problem))
    model.relations[0].association = false
    assert.ok(judge(model, problem).some(r => r.id.startsWith('rel-') && !r.passed))
  })
  if (problem.relations.some(([, , ma, mb]) => ma !== null || mb !== null)) test(`${problem.id}: wrong specified multiplicity fails`, () => {
    const index = problem.relations.findIndex(([, , ma, mb]) => ma !== null || mb !== null)
    const model = fromPlantUml(answer(problem))
    if (problem.relations[index][2] !== null) model.relations[index].sourceMultiplicity = '99'
    else model.relations[index].targetMultiplicity = '99'
    assert.ok(judge(model, problem).some(r => r.id.startsWith('mult-') && !r.passed))
  })
  test(`${problem.id}: reversed endpoints retain multiplicity semantics`, () => {
    const model = fromPlantUml(answer(problem))
    model.relations = model.relations.map(e => e.association ? ({ ...e, source: e.target, target: e.source, sourceMultiplicity: e.targetMultiplicity, targetMultiplicity: e.sourceMultiplicity }) : e)
    assert.ok(judge(model, problem).every(r => r.passed))
  })
}

const manuscript = problems.find(p => p.id === 'manuscript-reviews')
const direct = 'Revision "1" -- "0..*" Comment'
const throughReview = ['class Review', 'Review "0..*" -- "1" Revision', 'Review "1" -- "0..*" Comment']
const gradeManuscript = (lines) => judge(fromPlantUml(answer(manuscript, lines)), manuscript)
test('manuscript-reviews: both solutions pass in PlantUML and Mermaid', () => {
  for (const lines of [[direct], throughReview]) {
    assert.ok(gradeManuscript(lines).every(r => r.passed))
    const mermaid = toMermaid(parsePlantUml(answer(manuscript, lines)))
    assert.ok(judge(fromDiagram(parseMermaid(mermaid)), manuscript).every(r => r.passed))
  }
})
test('manuscript-reviews: ambiguous paths and misplaced comments fail', () => {
  const wrong = [
    ['Manuscript "1" -- "0..*" Comment'],
    ['Revision "0..*" -- "0..*" Comment'],
    [direct, 'Comment "0..*" -- "2" Revision'],
    [direct, ...throughReview],
    [direct, 'Manuscript "1" -- "0..*" Comment'],
    throughReview.slice(0, 2),
    ['interface Review', ...throughReview.slice(1)],
  ]
  for (const lines of wrong) {
    const report = gradeManuscript(lines)
    assert.deepEqual(report.filter(r => !r.passed).map(r => r.id), ['comment-revision-path'], lines.join('\n'))
  }
  assert.throws(() => gradeManuscript(['Revision "1" ..> "0..*" Comment']), /暂不支持转换关系类型/)
})
test('invalid syntax throws', () => assert.throws(() => fromPlantUml('@startuml\nclass {\n@enduml')))
test('operations cannot replace attributes', () => {
  const problem = problems.find(p => p.id === 'project-management')
  const model = fromPlantUml(answer(problem).replace('- employeeId: String', '+ employeeId(): String'))
  assert.equal(judge(model, problem).find(r => r.id === 'attr-Developer-employeeId').passed, false)
})
for (const p of problems.filter(p => p.lesson)) {
  test(`${p.id}: scaffold needs work; solution passes`, () => {
    assert.ok(judge(fromPlantUml(p.lesson.starter), p).some(r => !r.passed))
    assert.ok(judge(fromPlantUml(p.lesson.solution), p).every(r => r.passed))
  })
}
test('interface exercises distinguish interfaces, classes, attributes and methods', () => {
  const p = problems.find(p => p.id === 'learn-interface-method')
  const run = source => judge(fromPlantUml(`@startuml\n${source}\n@enduml`), p)
  assert.ok(run('interface Payable {\n+ pay(): Boolean\n}').every(r => r.passed))
  assert.ok(run('class Payable {\n+ pay(): Boolean\n}').some(r => r.id === 'interface-Payable' && !r.passed))
  assert.ok(run('interface Payable {\npay: Boolean\n}').some(r => r.id === 'method-Payable-pay' && !r.passed))
  assert.ok(judge(fromPlantUml('@startuml\ninterface Student\n@enduml'), problems.find(p => p.id === 'learn-class')).some(r => !r.passed))
})
test('association lesson does not require multiplicity', () => {
  const p = problems.find(p => p.id === 'learn-association')
  assert.ok(judge(fromPlantUml(p.lesson.solution), p).every(r => !r.id.startsWith('mult-')))
})
