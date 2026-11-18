import test from 'node:test'
import assert from 'node:assert/strict'
import { fromDiagram, judge } from '../src/judge.ts'
import { parsePlantUml } from '../src/uml/adapters/plantuml.ts'
const fromPlantUml = text => fromDiagram(parsePlantUml(text))
import { problems, emptySource } from '../src/problems.ts'

function answer(problem) {
  return '@startuml\n' + problem.classes.map(c => `class ${c.name} {\n${c.attributes.map(a => `- ${a}: String`).join('\n')}\n}`).join('\n') + '\n' + problem.relations.map(([a,b,ma,mb]) => `${a} "${ma}" -- "${mb}" ${b}`).join('\n') + '\n@enduml'
}
for (const problem of problems.filter(p => !p.lesson)) {
  test(`${problem.id}: correct source passes, empty source fails`, () => {
    assert.ok(judge(fromPlantUml(answer(problem)), problem).every(r => r.passed))
    assert.ok(judge(fromPlantUml(emptySource), problem).every(r => !r.passed))
  })
  test(`${problem.id}: wrong multiplicity and relationship type fail`, () => {
    const model = fromPlantUml(answer(problem))
    model.relations[0].sourceMultiplicity = '99'
    assert.ok(judge(model, problem).some(r => r.id.startsWith('mult-') && !r.passed))
    model.relations[0].association = false
    assert.ok(judge(model, problem).some(r => r.id.startsWith('rel-') && !r.passed))
  })
  test(`${problem.id}: reversed endpoints retain multiplicity semantics`, () => {
    const model = fromPlantUml(answer(problem))
    model.relations = model.relations.map(e => ({ ...e, source: e.target, target: e.source, sourceMultiplicity: e.targetMultiplicity, targetMultiplicity: e.sourceMultiplicity }))
    assert.ok(judge(model, problem).every(r => r.passed))
  })
}
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
