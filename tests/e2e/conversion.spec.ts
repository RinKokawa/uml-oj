import { expect, test } from '@playwright/test'

const sourceText = `@startuml
' preserve this comment if the canvas is unchanged
class Student {
  - name: String
  + learn(): void
}
class Course
Student "1" -- "0..*" Course : studies
@enduml`

test('source generates real editable nodes; canvas edits round-trip to PlantUML', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await source.fill(sourceText)
  await page.getByRole('button', { name: '切换到可视化绘图' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  const student = page.locator('.react-flow__node').filter({ hasText: 'Student' })
  await expect(student).toContainText('- name: String')
  await expect(student).toContainText('+ learn(): void')
  await page.getByRole('button', { name: 'PlantUML 源码模式' }).click()
  await expect(source).toHaveValue(sourceText)

  await page.getByRole('button', { name: '切换到可视化绘图' }).click()
  await student.dblclick()
  await page.getByPlaceholder('Name', { exact: true }).first().fill('Learner')
  await page.getByPlaceholder('Name', { exact: true }).nth(1).fill('- fullName: String')
  await page.getByRole('textbox', { name: 'New attribute', exact: true }).fill('- age: Integer')
  await page.getByRole('textbox', { name: 'New attribute', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'PlantUML 源码模式' }).click()
  await expect(source).toHaveValue(/class Learner/)
  await expect(source).toHaveValue(/- fullName: String/)
  await expect(source).toHaveValue(/- age: Integer/)
  await expect(source).toHaveValue(/\+ learn\(\): void/)
  await expect(source).toHaveValue(/Learner "1" -- "0\.\.\*" Course : studies/)
  await source.fill((await source.inputValue()).replace('class Course', 'class Course { - title: String }'))
  await page.getByRole('button', { name: '切换到可视化绘图' }).click()
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Course' })).toContainText('- title: String')
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('unsupported source blocks switching without overwriting source or canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await source.fill(sourceText)
  await page.getByRole('button', { name: '切换到可视化绘图' }).click()
  await page.getByRole('button', { name: 'PlantUML 源码模式' }).click()
  const unsupported = sourceText.replace('class Course', 'interface Course')
  await source.fill(unsupported)
  await page.getByRole('button', { name: '切换到可视化绘图' }).click()
  await expect(page.getByRole('alert')).toContainText('无法切换模式')
  await expect(source).toBeVisible()
  await expect(source).toHaveValue(unsupported)
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await source.fill(sourceText)
  await page.getByRole('button', { name: '切换到可视化绘图' }).click()
  await expect(page.locator('.editor-host')).toBeVisible()
})
