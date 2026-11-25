import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCatalog, filterCatalog } from '../src/catalog.ts'
import { problems } from '../src/problems.ts'

const entries = buildCatalog(problems.filter(problem => !problem.lesson),
  new Set(['project-management']), new Set(['project-management', 'library-loans']))
const defaults = { query: '', status: 'all', difficulty: 'all', topic: 'all', sort: 'number' }

test('catalog progress prioritizes completion over an earlier attempt', () => {
  assert.deepEqual(entries.slice(0, 2).map(entry => entry.status), ['solved', 'attempted'])
  assert.ok(entries.slice(2).every(entry => entry.status === 'untried'))
})
test('catalog filters combine and accept stable numbers or topic text', () => {
  const filter = fields => filterCatalog(entries, { ...defaults, ...fields }).map(entry => entry.number)
  assert.deepEqual(filter({ query: ' 02 ', status: 'attempted', topic: '业务记录', difficulty: '进阶' }), ['02'])
  assert.deepEqual(filter({ query: '版本建模' }), ['05'])
  assert.deepEqual(filter({ query: '12' }), ['12'])
  assert.deepEqual(filter({ query: ' 02 ', status: 'solved' }), [])
})
test('catalog difficulty sorting keeps original numbering and the order of ties', () => {
  assert.deepEqual(filterCatalog(entries, { ...defaults, sort: 'difficulty-desc' }).map(entry => entry.number), ['02', '05', '17', '18', '03', '04', '14', '15', '16', '19', '01', '12', '13', '06', '07', '08', '09', '10', '11'])
  assert.deepEqual(entries.map(entry => entry.number), Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, '0')))
})


test('Turin exercises get topic filters without invented difficulty or time estimates', () => {
  const named = filterCatalog(entries, { ...defaults, topic: '命名关联' }).filter(entry => entry.problem.id.startsWith('turin-'))
  assert.deepEqual(named.map(entry => entry.number), ['08', '10', '11'])
  assert.ok(named.every(entry => entry.difficulty === undefined && entry.duration === ''))
  assert.deepEqual(filterCatalog(entries, { ...defaults, sort: 'difficulty-asc' }).slice(-6).map(entry => entry.number),
    ['06', '07', '08', '09', '10', '11'])
})
test('reference-only exercises never count as solved or attempted', () => {
  const problem = { ...problems[0], referenceOnly: { missing: ['example'] } }
  const [entry] = buildCatalog([problem], new Set([problem.id]), new Set([problem.id]))
  assert.equal(entry.status, 'reference')
})

test('design patterns are discoverable without changing earlier problem numbers', () => {
  assert.deepEqual(filterCatalog(entries, { ...defaults, topic: '设计模式' }).map(entry => entry.number), ['18', '19'])
})
