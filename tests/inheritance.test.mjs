import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlantUml, toPlantUml } from '../src/uml/adapters/plantuml.ts'
import { parseMermaid, toMermaid } from '../src/uml/adapters/mermaid.ts'
import { toDrawio } from '../src/uml/adapters/drawio.ts'
import { judge, fromDiagram } from '../src/judge.ts'

const input = '@startuml\nclass Person\nclass Student\ninterface Printable\nPerson <|-- Student\nPrintable <|.. Student\n@enduml'
const requirement = { id: 'test', title: 'test', level: '', description: '', requirements: [], classes: [], relations: [], hint: '', typedRelations: [
  { source: 'Student', target: 'Person', type: 'ClassInheritance' },
  { source: 'Student', target: 'Printable', type: 'ClassRealization' },
] }

test('inheritance and realization preserve direction through PlantUML and Mermaid', () => {
  const model = parsePlantUml(input)
  assert.deepEqual(model.relations.map(r => [r.source, r.target, r.type]), [['Student', 'Person', 'ClassInheritance'], ['Student', 'Printable', 'ClassRealization']])
  assert.deepEqual(parsePlantUml(toPlantUml(model)), model)
  assert.deepEqual(parseMermaid(toMermaid(model)), model)
  assert.deepEqual(parseMermaid('classDiagram\nclass Person\nclass Student\nclass Printable {\n<<interface>>\n}\nPerson <|-- Student\nPrintable <|.. Student'), model)
})

test('typed relation grading rejects wrong direction, type and ordinary association', () => {
  const model = fromDiagram(parsePlantUml(input))
  assert.ok(judge(model, requirement).every(r => r.passed))
  model.relations[0] = { ...model.relations[0], source: 'Person', target: 'Student' }
  model.relations[1] = { ...model.relations[1], type: 'ClassBidirectional', association: true }
  assert.ok(judge(model, requirement).every(r => !r.passed))
})

test('retired draw.io adapter rejects new relations rather than silently changing their type', () => {
  const model = parsePlantUml('@startuml\nclass A\nclass B\nA --|> B\n@enduml')
  assert.throws(() => toDrawio(model), /不支持继承/)
})
