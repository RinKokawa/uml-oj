import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlantUml, toPlantUml } from '../src/uml/adapters/plantuml.ts'
import { parseMermaid, toMermaid } from '../src/uml/adapters/mermaid.ts'
import { parseDrawio, proposeClassTitleRepair, toDrawio, updateDrawio } from '../src/uml/adapters/drawio.ts'
import { DOMParser } from '@xmldom/xmldom'
import { judge, fromDiagram } from '../src/judge.ts'
import { problems } from '../src/problems.ts'

const source = `@startuml
class Student {
  - name: String
  + study(): void
}
class Course {
  + title: String
}
Student "1" -- "0..*" Course : attends
@enduml`
const model = () => parsePlantUml(source)

test('PlantUML, Mermaid and draw.io round-trip the OJ subset', () => {
  const diagram = model()
  assert.deepEqual(parsePlantUml(toPlantUml(diagram)), diagram)
  assert.deepEqual(parseMermaid(toMermaid(diagram)), diagram)
  assert.deepEqual(parseDrawio(toDrawio(diagram)), diagram)
})

test('Mermaid class blocks, type-first attributes, methods and implicit relation endpoints', () => {
  const diagram = parseMermaid(`classDiagram
%% preserve this input separately
class Student {
  -String name
  +study() void
}
Course : +String title
Student "1" -- "0..*" Course : attends`)
  assert.deepEqual(diagram, model())
  assert.deepEqual(parseMermaid(toMermaid(diagram)), diagram)
})

test('both directed and undirected associations preserve direction and multiplicities', () => {
  for (const arrow of ['--', '-->', '<--']) {
    const d = parsePlantUml(`@startuml\nclass A\nclass B\nA "1" ${arrow} "0..*" B : label\n@enduml`)
    assert.deepEqual(parseMermaid(toMermaid(d)), d, arrow)
    assert.deepEqual(parseDrawio(toDrawio(d)), d, arrow)
  }
})

test('pasted PlantUML in a draw.io class title has an explicit, loss-checked repair', () => {
  const original = `<mxfile host="embed.diagrams.net"><diagram id="page-1" name="UML"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="class-0" parent="1" style="swimlane;childLayout=stackLayout;html=0;" value="class Student&#xa;@enduml" vertex="1"><mxGeometry x="150" y="160" width="200" height="34" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
  assert.throws(() => parseDrawio(original), /类标题.*class-0/)
  const repair = proposeClassTitleRepair(original)
  assert.equal(repair.original, 'class Student\n@enduml')
  assert.equal(repair.className, 'Student')
  assert.equal(parseDrawio(repair.xml).classes[0].name, 'Student')
  assert.match(repair.xml, /x="150"/)
  assert.equal(proposeClassTitleRepair(original.replace('class Student&#xa;@enduml', 'class Student&#xa;class Course')), null)
  assert.equal(proposeClassTitleRepair(original.replace('</root>', '<mxCell id="extra" vertex="1" parent="1" style="shape=note;"/></root>')), null)
})

test('real draw.io Enter-terminated labels parse as single lines without losing their raw content', () => {
  const diagram = parsePlantUml('@startuml\nclass Classroom\nclass Student\nClassroom "1" -- "0..*" Student\n@enduml')
  const xml = toDrawio(diagram).replace('value="1"', 'value="1&#xa;"').replace('value="0..*"', 'value="0..*&#xa;"')
  assert.deepEqual(parseDrawio(xml), diagram)
  assert.ok(judge(fromDiagram(parseDrawio(xml)), problems.find(p => p.id === 'learn-multiplicity')).every(r => r.passed))
  const changed = structuredClone(diagram)
  changed.classes[0].name = 'Room'
  changed.relations[0].source = 'Room'
  const result = updateDrawio(xml, changed)
  const cells = Array.from(new DOMParser().parseFromString(result, 'application/xml').getElementsByTagName('mxCell'))
  assert.equal(cells.find(c => c.getAttribute('id') === 'edge-0-source').getAttribute('value'), '1\n')
  assert.equal(cells.find(c => c.getAttribute('id') === 'edge-0-target').getAttribute('value'), '0..*\n')
  assert.deepEqual(parseDrawio(result), changed)
  assert.throws(() => parseDrawio(xml.replace('1&#xa;', '1&#xa;extra')), /多行/)
})

test('draw.io multiplicity labels near an endpoint keep their sides and positions', () => {
  const original = toDrawio(model()).replace('x="-1" relative="1"', 'x="-0.83" relative="1"').replace('x="1" relative="1"', 'x="0.91" relative="1"')
  assert.deepEqual(parseDrawio(original), model())
  const changed = model()
  changed.relations[0].sourceMultiplicity = '0..1'
  const output = updateDrawio(original, changed)
  assert.deepEqual(parseDrawio(output), changed)
  assert.match(output, /x="-0\.83"/)
  assert.match(output, /x="0\.91"/)
  assert.throws(() => parseDrawio(original.replace('x="-0.83"', 'x="0.1"')), /无法确定/)
})

test('simple ellipse and rectangle class nodes preserve their geometry and reject unnamed placeholders', () => {
  const xml = `<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
    <mxCell id="edge" edge="1" parent="1" source="class-0" target="oval" style="edgeStyle=orthogonalEdgeStyle;html=1;" value=""><mxGeometry relative="1" as="geometry"/></mxCell>
    <mxCell id="class-0" parent="1" style="swimlane;childLayout=stackLayout;" value="Sister" vertex="1"><mxGeometry x="150" y="160" width="200" height="34" as="geometry"/></mxCell>
    <mxCell id="oval" parent="1" style="ellipse;whiteSpace=wrap;html=1;shapeInside=1;" value="" vertex="1"><mxGeometry x="210" y="251" width="80" height="80" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram></mxfile>`
  assert.throws(() => parseDrawio(xml), /oval.*类名为空/)
  const named = xml.replace('value="" vertex="1"', 'value="Brother" vertex="1"')
  const parsed = parseDrawio(named)
  assert.deepEqual(parsed.classes.map(c => c.name), ['Sister', 'Brother'])
  assert.equal(parsed.relations[0].source, 'Sister')
  assert.equal(parsed.relations[0].target, 'Brother')
  const renamed = structuredClone(parsed)
  renamed.classes[1].name = 'Sibling'
  renamed.relations[0].target = 'Sibling'
  const output = updateDrawio(named, renamed)
  assert.deepEqual(parseDrawio(output), renamed)
  assert.match(output, /style="ellipse;whiteSpace=wrap;html=1;shapeInside=1;"/)
  assert.match(output, /x="210" y="251"/)
  const withAttribute = structuredClone(parsed)
  withAttribute.classes[1].attributes.push('+ name: String')
  assert.throws(() => updateDrawio(named, withAttribute), /不能安全显示属性或方法/)
  assert.equal(parseDrawio(named.replace('ellipse;whiteSpace=wrap;', 'rounded=0;whiteSpace=wrap;')).classes[1].name, 'Brother')
  assert.throws(() => parseDrawio(named.replace('ellipse;whiteSpace=wrap;', 'rhombus;whiteSpace=wrap;')), /不是受支持/)
})

test('draw.io accepts a real UML class swimlane with member children and separator', () => {
  const xml = `<mxfile><diagram id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="c" parent="1" style="swimlane;fontStyle=1;childLayout=stackLayout;html=1;" value="Student" vertex="1"><mxGeometry width="160" height="86" as="geometry"/></mxCell>
  <mxCell id="a" parent="c" style="text;html=1;" value="- name: String" vertex="1"><mxGeometry as="geometry"/></mxCell>
  <mxCell id="l" parent="c" style="line;strokeWidth=1;" value="" vertex="1"><mxGeometry as="geometry"/></mxCell>
  <mxCell id="m" parent="c" style="text;html=1;" value="+ study(): void" vertex="1"><mxGeometry as="geometry"/></mxCell>
  </root></mxGraphModel></diagram></mxfile>`
  const d = parseDrawio(xml)
  assert.deepEqual(d.classes, model().classes.slice(0, 1))
})

test('draw.io source updates retain positions, styles, IDs, routing and page metadata', () => {
  const initial = toDrawio(model()).replace('name="UML"', 'name="My page"').replace('x="80" y="80"', 'x="420" y="310"').replace('fontStyle=1;align=center', 'fontStyle=1;fillColor=#ffeedd;align=center').replace('endArrow=none;startArrow=none;', 'strokeColor=#ff0000;endArrow=none;startArrow=none;').replace('<mxGeometry relative="1" as="geometry"/>', '<mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="400" y="550"/></Array></mxGeometry>')
  assert.equal(updateDrawio(initial, model()), initial)
  const changed = model()
  changed.classes[0].attributes.push('+ age: Integer')
  changed.relations[0].label = 'enrolls'
  changed.relations[0].targetMultiplicity = '1..*'
  const result = updateDrawio(initial, changed)
  assert.deepEqual(parseDrawio(result), changed)
  const doc = new DOMParser().parseFromString(result, 'application/xml')
  const cells = Array.from(doc.getElementsByTagName('mxCell'))
  const student = cells.find(c => c.getAttribute('value') === 'Student')
  const edge = cells.find(c => c.getAttribute('edge') === '1')
  assert.equal(doc.getElementsByTagName('diagram')[0].getAttribute('name'), 'My page')
  assert.equal(student.getAttribute('id'), 'class-0')
  assert.match(student.getAttribute('style'), /fillColor=#ffeedd/)
  assert.equal(student.getElementsByTagName('mxGeometry')[0].getAttribute('x'), '420')
  assert.equal(student.getElementsByTagName('mxGeometry')[0].getAttribute('y'), '310')
  assert.equal(edge.getAttribute('id'), 'edge-0')
  assert.match(edge.getAttribute('style'), /strokeColor=#ff0000/)
  assert.equal(edge.getElementsByTagName('mxPoint')[0].getAttribute('y'), '550')
  const renamed = structuredClone(changed)
  renamed.classes[0].name = 'Learner'
  renamed.relations[0].source = 'Learner'
  const renamedXml = updateDrawio(result, renamed)
  assert.deepEqual(parseDrawio(renamedXml), renamed)
  const renamedDoc = new DOMParser().parseFromString(renamedXml, 'application/xml')
  const learner = Array.from(renamedDoc.getElementsByTagName('mxCell')).find(c => c.getAttribute('value') === 'Learner')
  assert.equal(learner.getAttribute('id'), 'class-0')
  assert.equal(learner.getElementsByTagName('mxGeometry')[0].getAttribute('x'), '420')
})

test('unsupported content is rejected rather than silently discarded', () => {
  for (const text of ['classDiagram\nclass A\nA <|-- B', 'classDiagram\nnamespace N {\nclass A\n}', 'classDiagram\nclass A {\n<<service>>\n}', 'classDiagram\nnote "hello"', 'classDiagram\nclass A {\n+static()$\n}']) assert.throws(() => parseMermaid(text), /保留/)
  for (const text of ['@startuml\nabstract class A\n@enduml', '@startuml\nclass A\nclass B\nA --|> B\n@enduml']) assert.throws(() => parsePlantUml(text), /保留/)
  const xml = toDrawio(model())
  assert.throws(() => parseDrawio(xml.replace('</root>', '<mxCell id="note" value="hello" vertex="1" parent="1" style="shape=note;"/></root>')), /保留/)
  assert.throws(() => parseDrawio('<mxfile><diagram>compressed</diagram></mxfile>'), /压缩/)
  assert.throws(() => parseDrawio('<!DOCTYPE foo [<!ENTITY x "x">]><mxfile/>'), /保留/)
  assert.throws(() => parseDrawio(xml.replace('endArrow=none', 'endArrow=diamond')), /保留/)
  assert.throws(() => parseDrawio(xml.replace('fontStyle=1', 'fontStyle=2')), /抽象类/)
  assert.throws(() => parseDrawio(xml.replace('</root>', '<object id="x" label="lost"><mxCell/></object></root>')), /保留/)
  const changed = model()
  changed.classes[0].attributes.push('+ age: Integer')
  assert.throws(() => updateDrawio(xml.replace('<mxGeometry x="80"', '<!-- custom metadata --><mxGeometry x="80"'), changed), /保留/)
  const ambiguous = model()
  ambiguous.classes[0].name = 'Learner'
  ambiguous.classes[0].attributes.push('+ age: Integer')
  ambiguous.relations[0].source = 'Learner'
  assert.throws(() => updateDrawio(xml, ambiguous), /分步修改/)
  const withUnrepresentableLabel = model()
  withUnrepresentableLabel.relations[0].label = ' text '
  assert.throws(() => toDrawio(withUnrepresentableLabel), /保留/)
})

test('round-tripped UML model preserves the existing judge results', () => {
  for (const problem of problems) {
    const source = problem.lesson?.solution ?? ['@startuml', ...problem.classes.map(c => `class ${c.name} {\n${c.attributes.map(a => `- ${a}: String`).join('\n')}\n}`), ...problem.relations.map(([a,b,ma,mb]) => `${a}${ma === null ? '' : ` "${ma}"`} -- ${mb === null ? '' : `"${mb}" `}${b}`), '@enduml'].join('\n')
    const model = parsePlantUml(source)
    const expected = judge(fromDiagram(model), problem)
    // The retired draw.io adapter intentionally rejects interfaces instead of losing their kind.
    const base = model.classes.some(c => c.kind === 'interface') ? model : parseDrawio(toDrawio(model))
    const fromMermaid = parseMermaid(toMermaid(base))
    assert.deepEqual(judge(fromDiagram(fromMermaid), problem), expected, problem.id)
  }
})
