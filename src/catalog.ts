import type { Problem } from './problems'

export const catalogTopics = ['类与属性', '接口', '关联', '多重性', '继承', '命名关联', '业务记录', '版本建模'] as const
type Topic = typeof catalogTopics[number]
export const challengeLevels = ['入门', '中等', '进阶'] as const
type Level = typeof challengeLevels[number]
export const catalogStatuses = [
  { id: 'untried', label: '未尝试' },
  { id: 'attempted', label: '尝试过' },
  { id: 'solved', label: '已完成' },
  { id: 'reference', label: '待支持评测' },
] as const
export type CatalogStatus = typeof catalogStatuses[number]['id']

const topicsByProblem: Record<string, readonly Topic[]> = {
  'learn-class': ['类与属性'],
  'learn-attribute': ['类与属性'],
  'learn-association': ['关联'],
  'learn-multiplicity': ['关联', '多重性'],
  'learn-interface': ['接口'],
  'learn-interface-method': ['接口'],
  'learn-multiple-interfaces': ['接口'],
  'project-management': ['类与属性', '关联', '多重性'],
  'library-loans': ['关联', '多重性', '业务记录'],
  'indie-radar': ['关联', '多重性'],
  'renovation-inspections': ['多重性', '业务记录'],
  'manuscript-reviews': ['业务记录', '版本建模', '多重性'],
  'turin-university': ['类与属性', '关联', '多重性', '继承'],
  'turin-movie-shop': ['关联', '继承'],
  'turin-flights': ['关联', '多重性', '继承', '命名关联'],
  'turin-bank': ['关联', '继承', '业务记录'],
  'turin-hospital': ['类与属性', '关联', '多重性', '继承', '命名关联'],
  'turin-library': ['关联', '多重性', '命名关联', '业务记录'],
}

export function buildCatalog(items: readonly Problem[], completed: ReadonlySet<string>, attempted: ReadonlySet<string>) {
  return items.map((problem, index) => {
    const labels = problem.level.split(' · ')
    const status: CatalogStatus = problem.referenceOnly ? 'reference' : completed.has(problem.id) ? 'solved' : attempted.has(problem.id) ? 'attempted' : 'untried'
    const difficulty = challengeLevels.find(level => level === labels[0])
    return {
      problem, status, difficulty, index,
      topics: topicsByProblem[problem.id] ?? [],
      number: String(index + 1).padStart(2, '0'),
      duration: labels.find(label => label.endsWith(' 分钟'))?.replace('预计 ', '') ?? '',
      multiple: labels.includes('多解'),
    }
  })
}

export function filterCatalog(entries: ReturnType<typeof buildCatalog>, filters: {
  query: string
  status: 'all' | CatalogStatus
  difficulty: 'all' | Level
  topic: 'all' | Topic
  sort: 'number' | 'difficulty-asc' | 'difficulty-desc'
}) {
  const q = filters.query.trim().toLowerCase()
  const matches = entries.filter(entry =>
    (filters.status === 'all' || entry.status === filters.status) &&
    (filters.difficulty === 'all' || entry.difficulty === filters.difficulty) &&
    (filters.topic === 'all' || entry.topics.includes(filters.topic)) &&
    (!q || [entry.number, String(entry.index + 1), entry.problem.title, entry.problem.description, entry.problem.level, ...entry.topics]
      .some(text => text.toLowerCase().includes(q))),
  )
  if (filters.sort !== 'number') {
    const direction = filters.sort === 'difficulty-asc' ? 1 : -1
    matches.sort((a, b) => {
      if (!a.difficulty || !b.difficulty) return Number(!a.difficulty) - Number(!b.difficulty) || a.index - b.index
      return direction * (challengeLevels.indexOf(a.difficulty) - challengeLevels.indexOf(b.difficulty)) || a.index - b.index
    })
  }
  return matches
}
