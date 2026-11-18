import { expect, test } from '@playwright/test'

test('mobile can edit and judge an interface without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 5 关：认识接口' }).click()
  await page.getByRole('button', { name: '画布模式' }).click()
  await page.getByRole('button', { name: '编辑接口 Example' }).click()
  await page.getByLabel('接口名').fill('Printable')
  await page.getByRole('button', { name: '应用更改' }).click()
  await page.getByRole('button', { name: '源码模式' }).click()
  await expect(page.getByRole('textbox', { name: 'PlantUML source' })).toHaveValue(/interface Printable/)
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.getByText('本关通过！')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
