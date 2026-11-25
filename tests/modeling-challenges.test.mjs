import test from 'node:test'
import assert from 'node:assert/strict'
import { problems } from '../src/problems.ts'
import { fromDiagram, judge } from '../src/judge.ts'
import { parsePlantUml } from '../src/uml/adapters/plantuml.ts'
import { parseMermaid, toMermaid } from '../src/uml/adapters/mermaid.ts'
import { assertOjDiagram } from '../src/uml/model.ts'
import { modelingFixtures } from './modeling-fixtures.mjs'

const parse = body => parsePlantUml(`@startuml\n${body}\n@enduml`)
const model = (diagram) => { assertOjDiagram(diagram); return fromDiagram(diagram) }

test('every source-backed challenge is appended, unique and has a fixture', () => {
  const entries = problems.filter(p => !p.lesson)
  assert.deepEqual(entries.slice(11).map(p => p.id), modelingFixtures.map(([id]) => id))
  assert.equal(new Set(problems.map(p => p.id)).size, problems.length)
  assert.ok(entries.slice(11).every(p => p.source?.url.startsWith('https://') && !p.referenceOnly))
})

for (const [id, title, answer, correct, incorrect, failingRule] of modelingFixtures) {
  test(`${id}: accepts both formats and rejects a targeted mistake`, () => {
    const problem = problems.find(p => p.id === id)
    assert.equal(problem.title, title)
    const diagram = parse(answer)
    for (const input of [diagram, parseMermaid(toMermaid(diagram))]) {
      const report = judge(model(input), problem)
      assert.ok(report.length)
      assert.deepEqual(report.filter(row => !row.passed), [])
    }
    assert.ok(answer.includes(correct))
    const failed = judge(model(parse(answer.replace(correct, incorrect))), problem)
    assert.ok(failed.some(row => row.id === failingRule && !row.passed), failingRule)
  })
}
