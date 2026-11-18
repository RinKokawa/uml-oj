import { expect, test } from '@playwright/test'
import { installDrawio } from './fixture'

test('level four accepts real draw.io Enter-terminated endpoint labels and judges them', async ({ page }) => {
  await installDrawio(page)
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 4 关：读懂一对多' }).click()
  await expect(page.locator('.statusbar')).toContainText('已同步')
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  const canvas = frame.getByRole('textbox', { name: '画布 XML' })
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  const original = await canvas.inputValue()
  const edited = original.replace('value="?"', 'value="1&#xa;"').replace('value="?"', 'value="0..*&#xa;"')
  expect(edited).not.toBe(original)
  await canvas.fill(edited)
  await frame.getByRole('button', { name: '画布修改' }).click()
  await expect(source).toHaveValue(/Classroom "1" -- "0\.\.\*" Student/)
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.getByText('本关通过！')).toBeVisible()
  await page.reload()
  await expect(source).toHaveValue(/Classroom "1" -- "0\.\.\*" Student/)
  await expect(canvas).toHaveValue(/1&#xa;/)
})
