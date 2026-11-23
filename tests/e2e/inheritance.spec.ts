import { expect, test } from '@playwright/test'

test('reference exercise accepts inheritance and preserves it across source formats', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '正式挑战', exact: true }).click()
  await page.getByRole('button', { name: '开始作答：都灵练习：大学', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await source.fill('@startuml\nclass Person\nclass Professor\nPerson <|-- Professor\n@enduml')
  await expect(page.getByRole('button', { name: '编辑关联 Professor 到 Person' })).toBeVisible()
  await expect(page.locator('.edge-line').first()).toHaveAttribute('marker-end', 'url(#native-triangle)')
  await page.getByLabel('源码格式').selectOption('mermaid')
  await expect(page.getByRole('textbox', { name: 'Mermaid source' })).toHaveValue(/Professor --\|> Person/)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Mermaid source' })).toHaveValue(/Professor --\|> Person/)
  await expect(page.getByRole('button', { name: '提交评测' })).toBeEnabled()
})
