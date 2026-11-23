import test from 'node:test'
import assert from 'node:assert/strict'
import { problems } from '../src/problems.ts'
import { judge, fromDiagram } from '../src/judge.ts'
import { parsePlantUml } from '../src/uml/adapters/plantuml.ts'
import { parseMermaid, toMermaid } from '../src/uml/adapters/mermaid.ts'

const cases = [
  ['turin-university', 1, ['教室', '办公室', '院系', '唯一 ID', '教授', '职员', '正教授', '副教授', '助理教授', '座位数']],
  ['turin-movie-shop', 2, ['目录', '可充值卡', '订阅', '余额', '订单', '缺货']],
  ['turin-flights', 3, ['出发机场', '到达机场', '副驾驶', '型号', '维修', '地面', '空中', '经验等级', '机长', '领航员', '等级必须为 3']],
  ['turin-bank', 4, ['姓名', '地址', '余额', '储蓄账户', '利率', '投资账户', '股票', '数量', '价格', '佣金']],
  ['turin-hospital', 5, ['唯一', '姓', '出生日期', '儿子数量', '专长', '角色', '护士', '床位数', '主任医生', '手术室', '手术台']],
  ['turin-library', 6, ['编号', '作者', '页数', '手稿', '不同图书', 'editor', '不同日期', '三本', '起始日期', '归还日期']],
]
const answer = problem => {
  const classes = problem.classes.map(c => `class ${c.name}${c.attributes.length ? ` {\n${c.attributes.join('\n')}\n}` : ''}`)
  const normal = problem.relations.map(([a,b,ma,mb]) => `${a}${ma ? ` "${ma}"` : ''} -- ${mb ? `"${mb}" ` : ''}${b}`)
  const typed = (problem.typedRelations ?? []).map(r => `${r.source} ${r.type === 'ClassInheritance' ? '--|>' : '..|>'} ${r.target}`)
  const named = (problem.namedRelations ?? []).map(r => `${r.source}${r.sourceMultiplicity ? ` "${r.sourceMultiplicity}"` : ''} -- ${r.targetMultiplicity ? `"${r.targetMultiplicity}" ` : ''}${r.target} : ${r.label}`)
  return `@startuml\n${[...classes, ...normal, ...typed, ...named].join('\n')}\n@enduml`
}
for (const [id, page, phrases] of cases) {
  test(`${id}: original requirements remain visible and a complete answer passes both formats`, () => {
    const p = problems.find(item => item.id === id)
    assert.ok(p)
    assert.equal(p.source.page, page)
    assert.match(p.source.url, /class-diag-ex\.pdf$/)
    assert.ok(!p.referenceOnly)
    const text = [p.description, ...p.requirements].join(' ')
    for (const phrase of phrases) assert.ok(text.includes(phrase), `${id} missing ${phrase}`)
    const diagram = parsePlantUml(answer(p))
    assert.ok(judge(fromDiagram(diagram), p).every(r => r.passed))
    assert.ok(judge(fromDiagram(parseMermaid(toMermaid(diagram))), p).every(r => r.passed))
    assert.ok(judge(fromDiagram(parsePlantUml('@startuml\n@enduml')), p).some(r => !r.passed))
  })
}
test('independently written university answer passes', () => {
  const source = `@startuml
class Person {\nid\n}
class Professor
class Employee
class FullProfessor
class AssociateProfessor
class AssistantProfessor
class Department {\nname\n}
class Office {\nnumber\n}
class Classroom {\nnumber\nseats\n}
Person <|-- Professor
Person <|-- Employee
Professor <|-- FullProfessor
Professor <|-- AssociateProfessor
Professor <|-- AssistantProfessor
Department -- Office
Professor -- "1" Department
Employee -- "1" Office
@enduml`
  const p = problems.find(item => item.id === 'turin-university')
  assert.ok(judge(fromDiagram(parsePlantUml(source)), p).every(r => r.passed))
})
test('independently written flight answer passes and missing a role fails', () => {
  const source = `@startuml
class Airline {\nid\n}
class Flight {\nid\ndepartureTime\narrivalTime\n}
class Airport {\nid\n}
class Aircraft {\nmaintenanceStatus\nflightStatus\n}
class AircraftType
class Pilot {\nexperienceLevel\n}
class Captain
class Copilot
class Navigator
Airline -- Flight
Airline -- Aircraft
Airline -- Pilot
Flight -- "1" Aircraft
Aircraft -- "1" AircraftType
AircraftType -- Pilot
Pilot <|-- Captain
Pilot <|-- Copilot
Pilot <|-- Navigator
Flight -- "1" Airport : departure
Flight -- "1" Airport : arrival
Flight -- "1" Pilot : pilot
Flight -- "1" Pilot : copilot
@enduml`
  const p = problems.find(item => item.id === 'turin-flights')
  assert.ok(judge(fromDiagram(parsePlantUml(source)), p).every(r => r.passed))
  assert.ok(judge(fromDiagram(parsePlantUml(source.replace('Flight -- "1" Airport : arrival\n', ''))), p).some(r => r.id === 'named-Flight-Airport-arrival' && !r.passed))
})
test('named relationships require correct labels and the specified endpoint multiplicity', () => {
  const p = problems.find(item => item.id === 'turin-flights')
  const model = fromDiagram(parsePlantUml(answer(p)))
  model.relations.find(r => r.label === 'arrival').label = 'departure'
  assert.equal(judge(model, p).find(r => r.id === 'named-Flight-Airport-arrival').passed, false)
  const pilot = model.relations.find(r => r.label === 'pilot')
  pilot.targetMultiplicity = '0..*'
  assert.equal(judge(model, p).find(r => r.id === 'named-Flight-Pilot-pilot').passed, false)
})
test('named relationship accepts reversed undirected notation but not a reversed arrow', () => {
  const p = problems.find(item => item.id === 'turin-library')
  const model = fromDiagram(parsePlantUml(answer(p)))
  const edge = model.relations.find(r => r.label === 'currentLoans')
  ;[edge.source, edge.target] = [edge.target, edge.source]
  ;[edge.sourceMultiplicity, edge.targetMultiplicity] = [edge.targetMultiplicity, edge.sourceMultiplicity]
  assert.equal(judge(model, p).find(r => r.id === 'named-Student-Book-currentLoans').passed, true)
  edge.type = 'ClassUnidirectional'
  assert.equal(judge(model, p).find(r => r.id === 'named-Student-Book-currentLoans').passed, false)
})
test('one-sided multiplicity checks the specified endpoint', () => {
  const p = problems.find(item => item.id === 'turin-university')
  const model = fromDiagram(parsePlantUml(answer(p)))
  const edge = model.relations.find(r => r.source === 'Professor' && r.target === 'Department')
  edge.targetMultiplicity = '0..*'
  assert.equal(judge(model, p).find(r => r.id === 'mult-Professor-Department').passed, false)
})
