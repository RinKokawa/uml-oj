import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSource, serializeSource, readVisual, toVisual, semanticKey } from '../src/conversion.ts'
import { fromPlantUml, fromVisual, judge } from '../src/judge.ts'
import { problems } from '../src/problems.ts'

const blank = () => ({ version: '4.0.0', id: 'test', type: 'ClassDiagram', title: '', nodes: [], edges: [], assessments: {} })
const example = `@startuml
' A comment should not become a node.
abstract class Person {
  - name: String
  + greet(message: String): void
}
class Team {}
Person "0..*" -- "1" Team : belongs to
@enduml`

test('source ↔ visual preserves members, types, visibility, methods, abstraction, labels and multiplicities', () => {
  const diagram = parseSource(example)
  const visual = toVisual(diagram, blank())
  assert.deepEqual(readVisual(visual), diagram)
  assert.deepEqual(parseSource(serializeSource(readVisual(visual))), diagram)
})
test('all supported relationship types preserve arrow direction, labels and endpoints', () => {
  for (const arrow of ['--', '-->', '<--', '--|>', '<|--', '..>', '<..', '..|>', '<|..', '--o', 'o--', '--*', '*--']) {
    const diagram = parseSource(`@startuml\nclass A\nclass B\nA "1" ${arrow} "0..*" B : link\n@enduml`)
    assert.deepEqual(parseSource(serializeSource(readVisual(toVisual(diagram, blank())))), diagram, arrow)
  }
})
test('source edits retain IDs and positions of existing classes, even when inserting and reordering', () => {
  const previous = toVisual(parseSource(example), blank())
  previous.nodes[0].position = { x: 999, y: 333 }
  const updated = toVisual(parseSource('@startuml\nclass Added\nclass Team\nabstract class Person { - age: Integer }\n@enduml'), previous)
  assert.equal(updated.nodes[2].id, previous.nodes[0].id)
  assert.deepEqual(updated.nodes[2].position, { x: 999, y: 333 })
  assert.equal(new Set(updated.nodes.map(n => n.id)).size, 3)
})
test('layout-only changes do not change semantic key', () => {
  const visual = toVisual(parseSource(example), blank())
  const key = semanticKey(visual)
  visual.nodes[0].position.x += 100
  assert.equal(semanticKey(visual), key)
  visual.nodes[0].data.name = 'Renamed'
  assert.notEqual(semanticKey(visual), key)
})
test('unsupported or malformed source is rejected without changing the previous model', () => {
  const previous = toVisual(parseSource(example), blank())
  const snapshot = structuredClone(previous)
  for (const body of ['interface A', 'enum A { red }', 'note "hello" as N', 'skinparam shadowing false', 'class A as Alias', 'class A\nclass A', 'class A\nA -- B', 'class A {', 'class A { {static} x: String }', 'class A\nA "1 -- A', 'class A\n!include remote.puml']) {
    assert.throws(() => toVisual(parseSource(`@startuml\n${body}\n@enduml`), previous), body)
    assert.deepEqual(previous, snapshot)
  }
})
test('unsupported canvas elements and roles cannot be silently dropped', () => {
  const visual = toVisual(parseSource(example), blank())
  visual.nodes.push({ ...visual.nodes[0], id: 'note', type: 'titleAndDesctiption' })
  assert.throws(() => readVisual(visual), /非类节点/)
  visual.nodes.pop()
  visual.edges[0].data.sourceRole = 'owner'
  assert.throws(() => readVisual(visual), /角色名/)
})
for (const p of problems) {
  test(`${p.id}: judging agrees before and after source → canvas conversion`, () => {
    const source = p.lesson?.solution ?? ['@startuml', ...p.classes.map(c => `class ${c.name} {\n${c.attributes.map(a => `- ${a}: String`).join('\n')}\n}`), ...p.relations.map(([a,b,ma,mb]) => `${a}${ma === null ? '' : ` "${ma}"`} -- ${mb === null ? '' : `"${mb}" `}${b}`), '@enduml'].join('\n')
    assert.deepEqual(judge(fromVisual(toVisual(parseSource(source), blank())), p), judge(fromPlantUml(source), p))
    assert.ok(judge(fromVisual(toVisual(parseSource(source), blank())), p).every(r => r.passed))
  })
}
