import { expect, test } from '@playwright/test'
import { problems } from '../../src/problems'

test('tutorials teach one step at a time and advance without losing drafts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await expect(source).toHaveValue(problems[0].lesson!.starter)
  await expect(page.locator('.lesson-solution')).toHaveCount(0)
  const lessons = problems.filter(p => p.lesson)
  for (let i = 0; i < lessons.length; i++) {
    const p = lessons[i]
    await expect(page.getByRole('heading', { name: p.title, exact: true })).toBeVisible()
    await page.getByRole('button', { name: '提交评测' }).click()
    await expect(page.locator('.verdict')).toContainText('再试一下')
    await page.getByRole('button', { name: '查看参考答案' }).click()
    await expect(page.locator('.lesson-solution')).toContainText(p.lesson!.solution)
    await source.fill(p.lesson!.solution)
    await page.getByRole('button', { name: '提交评测' }).click()
    await expect(page.locator('.verdict')).toContainText('本关通过')
    await expect(page.getByRole('progressbar', { name: '教学进度' })).toHaveAttribute('value', String(i + 1))
    if (i < lessons.length - 1) {
      await page.getByRole('button', { name: '进入下一关' }).click()
      await expect(page.locator('.lesson-solution')).toHaveCount(0)
    }
  }
  await expect(page.getByText('全部教学已完成。')).toBeVisible()
  await expect(page.getByRole('button', { name: '进入下一关' })).toHaveCount(0)
  await expect(page.getByLabel('选择教学关卡').locator('option')).toHaveCount(4)
  await page.getByRole('button', { name: /正式挑战/ }).click()
  await expect(page.getByRole('heading', { name: '正式题库', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '开始作答：项目管理系统' }).click()
  await expect(page.getByLabel('选择正式关卡').locator('option')).toHaveCount(2)
  await expect(page.locator('.lesson-card')).toHaveCount(0)
  await expect(page.getByRole('progressbar', { name: '教学进度' })).toHaveCount(0)
  await source.fill('@startuml\nclass Draft\n@enduml')
  await page.getByLabel('选择正式关卡').selectOption('library-loans')
  await page.getByRole('button', { name: /教学关卡/ }).click()
  await page.getByRole('button', { name: `开始学习：${lessons[3].title}` }).click()
  await expect(page.getByRole('heading', { name: lessons[3].title, exact: true })).toBeVisible()
  await page.getByRole('button', { name: /正式挑战/ }).click()
  await page.getByRole('button', { name: '开始作答：图书借阅系统' }).click()
  await expect(page.getByRole('heading', { name: '图书借阅系统', exact: true })).toBeVisible()
  await page.getByLabel('选择正式关卡').selectOption('project-management')
  await expect(source).toHaveValue('@startuml\nclass Draft\n@enduml')
  await page.getByRole('button', { name: /教学关卡/ }).click()
  await page.getByRole('button', { name: `开始学习：${lessons[0].title}` }).click()
  await expect(source).toHaveValue(lessons[0].lesson!.solution)
})
