import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { Element as XmlElement } from '@xmldom/xmldom'
import { assertOjDiagram } from '../model.ts'
import type { ClassModel, Diagram, RelationModel } from '../model.ts'

function fail(message: string): never { throw new Error(`${message} 原 draw.io 内容已保留。`) }
function escape(value: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value) || textValue(value) !== value) fail('标签含不支持的字符或首尾空白。')
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;')
}
function styleMap(text: string): Map<string, string> {
  return new Map(text.split(';').filter(Boolean).map(item => {
    const at = item.indexOf('=')
    return at < 0 ? [item, '1'] : [item.slice(0, at), item.slice(at + 1)]
  }))
}
function textValue(value: string, context = '标签'): string {
  // Editing an html=0 label in the actual draw.io editor and pressing Enter
  // can append one newline to an otherwise single-line value. It is an editor
  // artifact, not a second line of UML; retain it in the XML when unchanged.
  const singleLine = value.replace(/\r?\n$/, '')
  if (/[<>\r\n]/.test(singleLine)) fail(`${context}含富文本、HTML 标签或多行文字，暂不能转换；请在画布中检查该标签。`)
  return singleLine.trim()
}
function endpointSide(x: string | null | undefined): 'source' | 'target' | null {
  if (x == null || !x.trim()) return null
  const position = Number(x)
  if (!Number.isFinite(position) || position < -1 || position > 1) return null
  if (position <= -0.5) return 'source'
  if (position >= 0.5) return 'target'
  return null
}

function isSimpleClassShape(styleText: string): boolean {
  const style = styleMap(styleText)
  const named = styleText.split(';').filter(item => item && !item.includes('='))
  const shape = style.get('shape')
  if (style.has('swimlane') || style.has('text') || style.has('line') || style.has('image')) return false
  if (named.some(name => name !== 'ellipse')) return false
  if (shape && shape !== 'rectangle' && shape !== 'ellipse') return false
  return !named.includes('ellipse') || !shape || shape === 'ellipse'
}

/**
 * Supports UML class swimlanes and simple rectangles or ellipses as class
 * nodes, plus solid class-to-class edges. Unknown cells are never discarded.
 * Layout and styles remain in the original XML.
 */
export function parseDrawio(xml: string): Diagram {
  if (!xml.trim() || /<!DOCTYPE|<!ENTITY/i.test(xml)) fail('XML 为空或包含不支持的文档类型。')
  let doc: ReturnType<DOMParser['parseFromString']>
  try {
    doc = new DOMParser({ onError: (_level, message) => { throw new Error(message) } }).parseFromString(xml, 'application/xml')
  } catch { return fail('无法解析 XML。') }
  const page = doc.documentElement
  if (!page) return fail('XML 没有根节点。')
  let graph
  if (page.tagName === 'mxGraphModel') graph = page
  else if (page.tagName === 'mxfile') {
    const pages = page.getElementsByTagName('diagram')
    if (pages.length !== 1) fail('暂只支持一个图页。')
    const graphs = pages.item(0)!.getElementsByTagName('mxGraphModel')
    if (graphs.length !== 1) fail('暂不支持压缩图页，请导出未压缩的 draw.io XML。')
    graph = graphs.item(0)!
  } else return fail('不是 draw.io XML。')
  if (!graph) return fail('图模型不存在。')
  const roots = graph.getElementsByTagName('root')
  if (roots.length !== 1) fail('图的根节点无效。')
  const root = roots.item(0)!
  const direct = Array.from(root.childNodes).filter(n => n.nodeType === 1)
  if (direct.some(n => n.nodeName !== 'mxCell')) fail('不支持对象元数据、组合容器或其他非标准元素。')
  const cells = direct as unknown as Array<{ getAttribute(name: string): string; getElementsByTagName(name: string): { item(index: number): { getAttribute(name: string): string } | null } }>
  const byId = new Map(cells.map(c => [c.getAttribute('id'), c]))
  if (byId.size !== cells.length || !byId.has('0') || !byId.has('1')) fail('节点 ID 重复或根图层缺失。')
  const diagram: Diagram = { classes: [], relations: [] }
  const names = new Map<string, string>()
  const handled = new Set(['0', '1'])
  for (const cell of cells) {
    const id = cell.getAttribute('id')
    if (id === '0' || id === '1' || cell.getAttribute('parent') !== '1' || cell.getAttribute('vertex') !== '1') continue
    const style = styleMap(cell.getAttribute('style') || '')
    const isUmlClass = style.has('swimlane') && style.get('childLayout') === 'stackLayout'
    const isSimple = isSimpleClassShape(cell.getAttribute('style') || '')
    if (!isUmlClass && !isSimple) fail(`图形 ${id} 不是受支持的 UML 类、简单矩形或椭圆。`)
    if ((Number(style.get('fontStyle') || '0') & 2) !== 0) fail('抽象类暂不支持转换。')
    const className = textValue(cell.getAttribute('value') || '', `类标题（图形 ID：${id}）`)
    if (!className) fail(`图形 ${id} 的类名为空；请双击填写类名。矩形和椭圆按类处理，不能作为未命名占位符。`)
    if (isSimple && cells.some(c => c.getAttribute('parent') === id)) fail(`简单图形 ${id} 包含子元素，暂不能作为类转换；请使用 UML 类形状。`)
    const item: ClassModel = { name: className, abstract: false, attributes: [], methods: [] }
    names.set(id, className)
    diagram.classes.push(item)
    handled.add(id)
    let seenMethod = false
    for (const member of cells.filter(c => c.getAttribute('parent') === id)) {
      const memberStyle = styleMap(member.getAttribute('style') || '')
      if (member.getAttribute('vertex') !== '1' || (!memberStyle.has('line') && !memberStyle.has('text'))) fail(`类 ${className} 包含不支持的子图形。`)
      const value = textValue(member.getAttribute('value') || '', `类 ${className} 的成员（图形 ID：${member.getAttribute('id')}）`)
      if (memberStyle.has('line')) {
        if (value) fail('分隔线上的文本无法转换。')
      } else if (value) {
        if (value.includes('(')) { seenMethod = true; item.methods.push(value) }
        else { if (seenMethod) fail(`类 ${className} 的属性位于方法之后，不能安全重排。`); item.attributes.push(value) }
      }
      handled.add(member.getAttribute('id'))
    }
  }
  for (const cell of cells) {
    if (cell.getAttribute('parent') !== '1' || cell.getAttribute('edge') !== '1') continue
    const style = styleMap(cell.getAttribute('style') || '')
    const start = style.get('startArrow') || 'none'
    const end = style.get('endArrow') || 'classic'
    if (start !== 'none' || !['none', 'open', 'classic'].includes(end) || (style.get('dashed') && style.get('dashed') !== '0')) fail('仅支持普通实线关联，不支持其他箭头或虚线。')
    const source = names.get(cell.getAttribute('source'))
    const target = names.get(cell.getAttribute('target'))
    if (!source || !target) fail('关联必须连接两个类，而不是自由端点或类的成员。')
    const relation: RelationModel = { source, target, type: end === 'none' ? 'ClassBidirectional' : 'ClassUnidirectional', label: textValue(cell.getAttribute('value') || '', `关联 ${source} → ${target} 的标签`), sourceMultiplicity: '', targetMultiplicity: '' }
    const edgeId = cell.getAttribute('id')
    handled.add(edgeId)
    for (const label of cells.filter(c => c.getAttribute('parent') === edgeId)) {
      if (label.getAttribute('vertex') !== '1' || !styleMap(label.getAttribute('style') || '').has('edgeLabel')) fail('关系包含无法识别的附加元素。')
      const x = label.getElementsByTagName('mxGeometry').item(0)?.getAttribute('x')
      const value = textValue(label.getAttribute('value') || '', `关联 ${source} → ${target} 的端点标签`)
      const side = endpointSide(x)
      if (side === 'source' && !relation.sourceMultiplicity) relation.sourceMultiplicity = value
      else if (side === 'target' && !relation.targetMultiplicity) relation.targetMultiplicity = value
      else fail('无法确定关系标签属于哪一端，请使用端点多重性标签。')
      handled.add(label.getAttribute('id'))
    }
    diagram.relations.push(relation)
  }
  if (cells.some(c => !handled.has(c.getAttribute('id')))) fail('包含不支持的图形、图层或关系。')
  assertOjDiagram(diagram)
  return diagram
}

/**
 * Propose, but never apply, one narrowly recognizable pasted PlantUML class
 * declaration in a class title. The caller must confirm and back up the raw XML.
 */
export function proposeClassTitleRepair(xml: string): { xml: string; original: string; className: string } | null {
  if (!xml.trim() || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null
  try {
    const doc = new DOMParser({ onError: (_level, message) => { throw new Error(message) } }).parseFromString(xml, 'application/xml')
    const roots = doc.getElementsByTagName('root')
    if (roots.length !== 1) return null
    const cells = Array.from(roots.item(0)!.childNodes).filter(n => n.nodeType === 1 && n.nodeName === 'mxCell') as XmlElement[]
    const matches = cells.flatMap(cell => {
      const style = styleMap(cell.getAttribute('style') || '')
      if (cell.getAttribute('parent') !== '1' || cell.getAttribute('vertex') !== '1' || !style.has('swimlane') || style.get('childLayout') !== 'stackLayout') return []
      const original = cell.getAttribute('value') || ''
      const match = /^[ \t]*(?:@startuml[ \t]*\r?\n[ \t]*)?class[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*(?:\r?\n[ \t]*@enduml[ \t]*)?[ \t]*$/.exec(original)
      return match ? [{ cell, original, className: match[1] }] : []
    })
    if (matches.length !== 1) return null
    const { cell, original, className } = matches[0]
    cell.setAttribute('value', className)
    const repaired = new XMLSerializer().serializeToString(doc)
    parseDrawio(repaired) // Never offer a partial repair that still drops or ignores other content.
    return { xml: repaired, original, className }
  } catch { return null }
}

/** Creates an editable, uncompressed draw.io XML document for the OJ subset. */
export function toDrawio(diagram: Diagram): string {
  assertOjDiagram(diagram)
  if (diagram.classes.some(c => c.kind === 'interface')) fail('旧 draw.io 适配器尚不支持接口，无法无损转换。')
  if (diagram.relations.some(r => !['ClassBidirectional', 'ClassUnidirectional'].includes(r.type))) fail('旧 draw.io 适配器尚不支持继承或实现关系，无法无损转换。')
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
  const ids = new Map<string, string>()
  diagram.classes.forEach((c, i) => {
    const id = `class-${i}`
    ids.set(c.name, id)
    const members = [...c.attributes, ...c.methods]
    const height = 34 + members.length * 26 + (c.methods.length ? 8 : 0)
    cells.push(`<mxCell id="${id}" value="${escape(c.name)}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;collapsible=1;html=0;" vertex="1" parent="1"><mxGeometry x="${80 + (i % 3) * 260}" y="${80 + Math.floor(i / 3) * 220}" width="200" height="${height}" as="geometry"/></mxCell>`)
    let y = 26
    for (const [index, value] of members.entries()) {
      if (index === c.attributes.length && c.methods.length) {
        cells.push(`<mxCell id="${id}-line" value="" style="line;strokeWidth=1;" vertex="1" parent="${id}"><mxGeometry y="${y}" width="200" height="8" as="geometry"/></mxCell>`)
        y += 8
      }
      cells.push(`<mxCell id="${id}-member-${index}" value="${escape(value)}" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;html=0;" vertex="1" parent="${id}"><mxGeometry y="${y}" width="200" height="26" as="geometry"/></mxCell>`)
      y += 26
    }
  })
  diagram.relations.forEach((r, i) => {
    const id = `edge-${i}`
    cells.push(`<mxCell id="${id}" value="${escape(r.label)}" style="endArrow=${r.type === 'ClassBidirectional' ? 'none' : 'open'};startArrow=none;html=0;" edge="1" parent="1" source="${ids.get(r.source)}" target="${ids.get(r.target)}"><mxGeometry relative="1" as="geometry"/></mxCell>`)
    for (const [side, x, value] of [['source', '-1', r.sourceMultiplicity], ['target', '1', r.targetMultiplicity]]) {
      if (value) cells.push(`<mxCell id="${id}-${side}" value="${escape(value)}" style="edgeLabel;html=0;" vertex="1" connectable="0" parent="${id}"><mxGeometry x="${x}" relative="1" as="geometry"/></mxCell>`)
    }
  })
  return `<mxfile><diagram id="page-1" name="UML"><mxGraphModel><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`
}

/**
 * Update a supported draw.io document from the semantic model without throwing
 * away the existing file metadata, class positions, matched shapes' styles or
 * edge routing. IDs of matched elements remain stable. The caller must still
 * save a snapshot before applying the result and handle a failed conversion.
 */
export function updateDrawio(xml: string, diagram: Diagram): string {
  const previous = parseDrawio(xml)
  assertOjDiagram(diagram)
  if (JSON.stringify(previous) === JSON.stringify(diagram)) return xml

  const parser = new DOMParser({ onError: (_level, message) => { throw new Error(message) } })
  const oldDoc = parser.parseFromString(xml, 'application/xml')
  const newDoc = parser.parseFromString(toDrawio(diagram), 'application/xml')
  const oldRoot = oldDoc.getElementsByTagName('root').item(0)!
  const newRoot = newDoc.getElementsByTagName('root').item(0)!
  const directCells = (root: XmlElement): XmlElement[] => Array.from(root.childNodes).filter(n => n.nodeType === 1 && n.nodeName === 'mxCell') as XmlElement[]
  const oldCells = directCells(oldRoot)
  const newCells = directCells(newRoot)
  for (const cell of oldCells) {
    const nodes = Array.from(cell.childNodes)
    const children = nodes.filter(n => n.nodeType === 1)
    if (children.some(n => n.nodeName !== 'mxGeometry') || children.length > 1 || nodes.some(n => n.nodeType === 8 || (n.nodeType === 3 && !!n.nodeValue?.trim()))) fail('图形包含无法安全保留的嵌套内容。')
  }
  const oldClasses = oldCells.filter(c => c.getAttribute('parent') === '1' && c.getAttribute('vertex') === '1')
  const newClasses = newCells.filter(c => c.getAttribute('parent') === '1' && c.getAttribute('vertex') === '1')
  const oldEdges = oldCells.filter(c => c.getAttribute('parent') === '1' && c.getAttribute('edge') === '1')
  const newEdges = newCells.filter(c => c.getAttribute('parent') === '1' && c.getAttribute('edge') === '1')
  const oldByName = new Map(previous.classes.map((c, i) => [c.name, oldClasses[i]]))
  const matchedOld = new Set<XmlElement>()
  const classPairs = new Map<XmlElement, XmlElement>()
  for (const [i, item] of diagram.classes.entries()) {
    const old = oldByName.get(item.name)
    if (old) { classPairs.set(newClasses[i], old); matchedOld.add(old) }
  }
  // A unique rename with identical members can retain its shape and ID.
  const remainingOld = previous.classes.map((c, i) => ({ c, cell: oldClasses[i] })).filter(x => !matchedOld.has(x.cell))
  const remainingNew = diagram.classes.map((c, i) => ({ c, cell: newClasses[i] })).filter(x => !classPairs.has(x.cell))
  if (remainingOld.length === 1 && remainingNew.length === 1 &&
      JSON.stringify([remainingOld[0].c.attributes, remainingOld[0].c.methods]) === JSON.stringify([remainingNew[0].c.attributes, remainingNew[0].c.methods])) {
    classPairs.set(remainingNew[0].cell, remainingOld[0].cell)
  } else if (remainingOld.length && remainingNew.length) {
    fail('无法安全对应已改名或同时增删的类，请分步修改以保留原画布样式。')
  }
  const matched = new Map<XmlElement, XmlElement>(classPairs)
  const memberCells = (cells: XmlElement[], parent: string) => cells.filter(c => c.getAttribute('parent') === parent && c.getAttribute('vertex') === '1')
  for (const [fresh, old] of classPairs) {
    if (isSimpleClassShape(old.getAttribute('style') || '') && memberCells(newCells, fresh.getAttribute('id')!).length) {
      fail(`简单矩形或椭圆 ${old.getAttribute('value')} 不能安全显示属性或方法；请先改用 UML 类形状。`)
    }
    const oldChildren = memberCells(oldCells, old.getAttribute('id')!)
    const newChildren = memberCells(newCells, fresh.getAttribute('id')!)
    const used = new Set<XmlElement>()
    for (const child of newChildren) {
      const kind = styleMap(child.getAttribute('style') || '').has('line') ? 'line' : 'text'
      const equal = oldChildren.find(c => !used.has(c) && styleMap(c.getAttribute('style') || '').has(kind) && textValue(c.getAttribute('value') || '') === textValue(child.getAttribute('value') || ''))
      if (equal) { matched.set(child, equal); used.add(equal) }
    }
    // A modified member can retain the previous member's formatting when the
    // correspondence is unambiguous; inserted/deleted members use defaults.
    const missingNew = newChildren.filter(c => !matched.has(c) && styleMap(c.getAttribute('style') || '').has('text'))
    const missingOld = oldChildren.filter(c => !used.has(c) && styleMap(c.getAttribute('style') || '').has('text'))
    if (missingNew.length === 1 && missingOld.length === 1) matched.set(missingNew[0], missingOld[0])
    else if (missingNew.length && missingOld.length) fail('无法安全对应同时更改的多个成员，请分步修改以保留样式。')
  }
  const usedEdges = new Set<number>()
  for (const [i, relation] of diagram.relations.entries()) {
    const oldSource = classPairs.get(newClasses[diagram.classes.findIndex(c => c.name === relation.source)])
    const oldTarget = classPairs.get(newClasses[diagram.classes.findIndex(c => c.name === relation.target)])
    if (!oldSource || !oldTarget) continue
    const candidates = previous.relations.map((r, n) => ({ r, n })).filter(({ n }) => !usedEdges.has(n) && oldEdges[n].getAttribute('source') === oldSource.getAttribute('id') && oldEdges[n].getAttribute('target') === oldTarget.getAttribute('id'))
    const exact = candidates.find(({ r }) => r.type === relation.type && r.label === relation.label && r.sourceMultiplicity === relation.sourceMultiplicity && r.targetMultiplicity === relation.targetMultiplicity)
    const chosen = exact ?? (candidates.length === 1 ? candidates[0] : undefined)
    if (!chosen && candidates.length > 1) fail('无法安全对应同一对类之间的多条关联，请分步修改。')
    if (!chosen) continue
    usedEdges.add(chosen.n)
    const fresh = newEdges[i], old = oldEdges[chosen.n]
    matched.set(fresh, old)
    const oldLabels = memberCells(oldCells, old.getAttribute('id')!)
    const newLabels = memberCells(newCells, fresh.getAttribute('id')!)
    for (const label of newLabels) {
      const side = endpointSide(label.getElementsByTagName('mxGeometry').item(0)?.getAttribute('x'))
      const original = oldLabels.find(l => endpointSide(l.getElementsByTagName('mxGeometry').item(0)?.getAttribute('x')) === side)
      if (original) matched.set(label, original)
    }
  }

  const reserved = new Set(oldCells.map(c => c.getAttribute('id')!))
  const ids = new Map<string, string>([['0', '0'], ['1', '1']])
  let counter = 0
  for (const fresh of newCells) {
    const id = fresh.getAttribute('id')!
    if (id === '0' || id === '1') continue
    const old = matched.get(fresh)
    let next = old?.getAttribute('id') || ''
    if (!next) {
      do { next = `uml-oj-${++counter}` } while (reserved.has(next))
      reserved.add(next)
    }
    ids.set(id, next)
    if (!old) continue
    // An unchanged label keeps its exact original text, including draw.io's
    // trailing edit newline, even when another element is updated.
    const oldValue = old.getAttribute('value') || ''
    const newValue = fresh.getAttribute('value') || ''
    if (textValue(oldValue) === textValue(newValue)) fresh.setAttribute('value', oldValue)
    // Keep non-semantic cell attributes, such as link, visibility and folding.
    for (const attr of Array.from(old.attributes)) {
      if (!['id', 'parent', 'source', 'target', 'value', 'style', 'vertex', 'edge'].includes(attr.name)) fresh.setAttribute(attr.name, attr.value)
    }
    let oldStyle = old.getAttribute('style') || ''
    if (fresh.getAttribute('edge') === '1') {
      const arrow = styleMap(fresh.getAttribute('style') || '').get('endArrow') || 'none'
      const oldArrow = styleMap(oldStyle).get('endArrow') || 'classic'
      if ((arrow === 'none') !== (oldArrow === 'none')) {
        oldStyle = oldStyle.split(';').filter(s => s && !s.startsWith('startArrow=') && !s.startsWith('endArrow=')).join(';') + `;startArrow=none;endArrow=${arrow};`
      }
    }
    fresh.setAttribute('style', oldStyle)
    const oldGeometry = old.getElementsByTagName('mxGeometry').item(0)
    const freshGeometry = fresh.getElementsByTagName('mxGeometry').item(0)
    if (oldGeometry && freshGeometry && freshGeometry.parentNode === fresh) {
      const geometry = newDoc.importNode(oldGeometry, true) as XmlElement
      if (fresh.getAttribute('parent') !== '1' && fresh.getAttribute('edge') !== '1' && (styleMap(fresh.getAttribute('style') || '').has('text') || styleMap(fresh.getAttribute('style') || '').has('line'))) {
        const y = freshGeometry.getAttribute('y')
        if (y) geometry.setAttribute('y', y); else geometry.removeAttribute('y')
      }
      if (fresh.getAttribute('parent') === '1' && fresh.getAttribute('vertex') === '1') {
        const height = Math.max(Number(geometry.getAttribute('height') || 0), Number(freshGeometry.getAttribute('height') || 0))
        if (height) geometry.setAttribute('height', String(height))
      }
      fresh.replaceChild(geometry, freshGeometry)
    }
  }
  for (const fresh of newCells) {
    const id = fresh.getAttribute('id')!
    if (id === '0' || id === '1') continue
    for (const attr of ['id', 'parent', 'source', 'target']) {
      const value = fresh.getAttribute(attr)
      if (value && ids.has(value)) fresh.setAttribute(attr, ids.get(value)!)
    }
  }
  // Retain the original root layer cells and surrounding file/page metadata.
  for (const cell of oldCells) if (!['0', '1'].includes(cell.getAttribute('id')!)) oldRoot.removeChild(cell)
  for (const cell of newCells) if (!['0', '1'].includes(cell.getAttribute('id')!)) oldRoot.appendChild(oldDoc.importNode(cell, true))
  const output = new XMLSerializer().serializeToString(oldDoc)
  if (JSON.stringify(parseDrawio(output)) !== JSON.stringify(diagram)) fail('更新后语义不一致，未应用更改。')
  return output
}
