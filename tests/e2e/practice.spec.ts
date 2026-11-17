import { expect, test } from '@playwright/test'
import { problems } from '../../src/problems'

test('both exercises can be solved; reports, drafts and editor survive switching', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: /正式挑战/ }).click()
  await page.getByRole('button', { name: '开始作答：项目管理系统' }).click()
  await page.getByRole('button', { name: '切换到可视化绘图' }).click()
  await expect(page.locator('.editor-host .react-flow')).toBeVisible()
  await page.getByRole('button', { name: 'PlantUML 源码模式' }).click()
  const textarea = page.getByRole('textbox', { name: 'PlantUML source' })
  const challenges = problems.filter(p => !p.lesson)
  for (const p of challenges) {
    await page.getByLabel('选择正式关卡').selectOption(p.id)
    await page.getByRole('button', { name: '提交评测' }).click()
    await expect(page.locator('.verdict')).toHaveText('WRONG ANSWER')
    const source = '@startuml\n' + p.classes.map(c => `class ${c.name} {\n${c.attributes.map(a => `- ${a}: String`).join('\n')}\n}`).join('\n') + '\n' + p.relations.map(([a,b,ma,mb]) => `${a} "${ma}" -- "${mb}" ${b}`).join('\n') + '\n@enduml'
    await textarea.fill(source)
    await expect(page.locator('.results')).toHaveCount(0)
    await page.getByRole('button', { name: '提交评测' }).click()
    await expect(page.locator('.verdict')).toHaveText('ACCEPTED')
    await textarea.fill(source.replace('"0..*"', '"99"'))
    await page.getByRole('button', { name: '提交评测' }).click()
    await expect(page.locator('.verdict')).toHaveText('WRONG ANSWER')
    await textarea.fill(source)
  }
  await page.getByLabel('选择正式关卡').selectOption(challenges[0].id)
  await expect(textarea).toHaveValue(/class Developer/)
  await textarea.fill('@startuml\nclass {\n@enduml')
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.getByRole('alert')).toContainText('无法解析模型')
  await page.getByRole('button', { name: '切换到可视化绘图' }).click()
  await expect(page.getByRole('alert')).toContainText('无法切换模式')
  await expect(textarea).toBeVisible()
  await textarea.fill('@startuml\nclass Developer\n@enduml')
  await page.getByRole('button', { name: '切换到可视化绘图' }).click()
  await expect(page.locator('.editor-host .react-flow')).toBeVisible()
  await expect(page.locator('.react-flow__node')).toContainText('Developer')
  expect(errors).toEqual([])
})
