import { expect, test } from '@playwright/test'
import { modelingFixtures } from '../modeling-fixtures.mjs'

for (const [id, title, answer, correct, incorrect] of modelingFixtures) {
  test(`new exercise ${id} is visible, rejects an error and can be solved`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '正式挑战', exact: true }).click()
    const catalog = page.getByRole('region', { name: '正式题目列表' })
    if (id === 'modeling-shipping-strategy') await catalog.getByRole('button', { name: '设计模式', exact: true }).click()
    const start = catalog.getByRole('button', { name: `开始作答：${title}`, exact: true })
    await start.click()
    const url = page.locator('.problem-source a')
    await expect(url).toHaveAttribute('href', /^https:\/\/(cruise\.umple\.org|github\.com\/torokmark)\//)
    await expect(url).not.toContainText(' 页')
    const editor = page.getByRole('textbox', { name: 'PlantUML source' })
    const submit = page.getByRole('button', { name: '提交评测', exact: true })
    const plantuml = (body: string) => `@startuml\n${body}\n@enduml`
    await editor.fill(plantuml(answer.replace(correct, incorrect)))
    await submit.click()
    await expect(page.locator('.score strong')).toHaveText(/^\d+\/\d+$/)
    await expect(page.locator('.verdict')).not.toHaveText('ACCEPTED')
    if (id === 'modeling-warehouse-moves') {
      const edge = page.getByRole('button', { name: '编辑关联 MovementLocation 到 Movement：to', exact: true })
      await edge.locator('.edge-handle').click()
      await page.getByLabel('MovementLocation端多重性（起点）', { exact: true }).fill('1')
      await page.getByRole('button', { name: '应用更改' }).click()
    } else {
      await editor.fill(plantuml(answer))
    }
    if (id === 'modeling-shipping-strategy') {
      await page.getByLabel('源码格式').selectOption('mermaid')
      await expect(page.getByRole('textbox', { name: 'Mermaid source' })).toHaveValue(/ShippingPolicy/)
    }
    await submit.click()
    await expect(page.locator('.verdict')).toHaveText('ACCEPTED')
    await page.getByRole('button', { name: '返回正式题库' }).click()
    await expect(catalog.getByRole('row').filter({ has: start })).toContainText('已完成')
  })
}
