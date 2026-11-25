import { expect, test } from '@playwright/test'
import { problems } from '../../src/problems'

function sourceFor(problem: typeof problems[number]) {
  const classes = problem.classes.map(c => `class ${c.name}${c.attributes.length ? ` {\n${c.attributes.join('\n')}\n}` : ''}`)
  const ordinary = problem.relations.map(([a,b,ma,mb]) => `${a}${ma ? ` "${ma}"` : ''} -- ${mb ? `"${mb}" ` : ''}${b}`)
  const typed = (problem.typedRelations ?? []).map(r => `${r.source} ${r.type === 'ClassInheritance' ? '--|>' : '..|>'} ${r.target}`)
  const named = (problem.namedRelations ?? []).map(r => `${r.source}${r.sourceMultiplicity ? ` "${r.sourceMultiplicity}"` : ''} -- ${r.targetMultiplicity ? `"${r.targetMultiplicity}" ` : ''}${r.target} : ${r.label}`)
  return `@startuml\n${[...classes, ...ordinary, ...typed, ...named].join('\n')}\n@enduml`
}

test('all six original exercises can be solved and graded, and old simplified completion does not count', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('uml-oj-native-drafts-v1')) localStorage.setItem('uml-oj-native-drafts-v1', JSON.stringify({ version: 1, drafts: {}, completed: ['turin-university'], selectedId: 'learn-class' }))
  })
  await page.goto('/')
  await page.getByRole('button', { name: '正式挑战', exact: true }).click()
  const catalog = page.getByRole('region', { name: '正式题目列表' })
  await expect(catalog.locator('tbody tr')).toHaveCount(19)
  await expect(page.locator('.catalog-progress')).toContainText('0 / 19')
  await expect(catalog.locator('tbody tr').filter({ hasText: '都灵练习：大学' })).toContainText('未尝试')
  await catalog.getByRole('button', { name: '开始作答：都灵练习：大学', exact: true }).click()
  await expect(page.locator('.problem-source')).toContainText('原题题意的中文翻译')
  await expect(page.locator('.problem-source a')).toHaveAttribute('href', 'https://softeng.polito.it/tongji/SE/ex/class-diag-ex.pdf')
  await expect(page.getByRole('region', { name: '本题评测约定' })).toContainText('Professor')
  await expect(page.locator('.statement')).toContainText('助理教授')

  for (const problem of problems.filter(p => p.id.startsWith('turin-'))) {
    await page.getByLabel('选择正式关卡').selectOption(problem.id)
    await page.getByRole('textbox', { name: 'PlantUML source' }).fill(sourceFor(problem))
    if (problem.id === 'turin-flights') {
      await page.getByLabel('源码格式').selectOption('mermaid')
      await expect(page.getByRole('textbox', { name: 'Mermaid source' })).toHaveValue(/arrival/)
    }
    await page.getByRole('button', { name: '提交评测' }).click()
    await expect(page.locator('.verdict')).toHaveText('ACCEPTED')
  }
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'PlantUML source' })).toHaveValue(/class Publication/)
  await page.getByRole('button', { name: '返回正式题库' }).click()
  await expect(page.locator('.catalog-progress')).toContainText('6 / 19')
})

test('bank exercise can be completed using the canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '正式挑战', exact: true }).click()
  await page.getByRole('button', { name: '开始作答：都灵练习：银行系统', exact: true }).click()
  const nodes = [
    ['Customer', ['name', 'address']], ['Account', ['balance']], ['SavingsAccount', ['interestRate']],
    ['InvestmentAccount', []], ['Stock', []], ['StockOrder', ['quantity', 'price', 'commission']],
  ] as const
  for (const [name, attrs] of nodes) {
    await page.getByRole('button', { name: '添加元素' }).click()
    await page.getByRole('button', { name: '添加类', exact: true }).click()
    await page.getByLabel('类名', { exact: true }).fill(name)
    for (let i = 0; i < attrs.length; i++) {
      await page.getByRole('button', { name: '添加属性' }).click()
      await page.getByLabel(`属性 ${i + 1} 名称`).fill(attrs[i])
    }
    await page.getByRole('button', { name: '应用更改' }).click()
  }
  const edges = [
    ['Customer', 'Account', 'ClassBidirectional'], ['InvestmentAccount', 'StockOrder', 'ClassBidirectional'],
    ['StockOrder', 'Stock', 'ClassBidirectional'], ['SavingsAccount', 'Account', 'ClassInheritance'],
    ['InvestmentAccount', 'Account', 'ClassInheritance'],
  ] as const
  for (const [from, to, type] of edges) {
    await page.getByRole('button', { name: '添加关联' }).click()
    await page.getByRole('button', { name: `选为起点 ${from}` }).click()
    await page.getByRole('button', { name: `选为终点 ${to}` }).click()
    await page.getByLabel('起点类').selectOption(from)
    await page.getByLabel('终点类').selectOption(to)
    await page.getByLabel('关联方向').selectOption(type)
    await page.getByRole('button', { name: '应用更改' }).click()
  }
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.locator('.verdict')).toHaveText('ACCEPTED')
})

test('parallel named relationships are visible and independently selectable', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '正式挑战', exact: true }).click()
  await page.getByRole('button', { name: '开始作答：都灵练习：航班', exact: true }).click()
  await page.getByRole('textbox', { name: 'PlantUML source' }).fill('@startuml\nclass Flight\nclass Airport\nFlight -- "1" Airport : departure\nFlight -- "1" Airport : arrival\n@enduml')
  const departure = page.getByRole('button', { name: '编辑关联 Flight 到 Airport：departure', exact: true })
  const arrival = page.getByRole('button', { name: '编辑关联 Flight 到 Airport：arrival', exact: true })
  await expect(departure).toBeVisible()
  await expect(arrival).toBeVisible()
  const firstPath = await departure.locator('.edge-line').getAttribute('d')
  const secondPath = await arrival.locator('.edge-line').getAttribute('d')
  expect(firstPath).toBeTruthy()
  expect(secondPath).toBeTruthy()
  expect(firstPath).not.toBe(secondPath)
  await arrival.locator('.edge-handle').click()
  await expect(page.getByLabel('关系名称')).toHaveValue('arrival')
  await departure.locator('.edge-handle').click()
  await expect(page.getByLabel('关系名称')).toHaveValue('departure')
})
