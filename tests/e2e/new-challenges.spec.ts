import { expect, test } from '@playwright/test'

test('the new formal challenges are playable, including both manuscript models', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '正式挑战', exact: true }).click()
  const entries = page.getByRole('region', { name: '正式题目列表' }).locator('tbody tr')
  await expect(entries).toHaveCount(11)
  await entries.nth(2).getByRole('button', { name: /开始作答/ }).click()
  const question = page.getByLabel('选择正式关卡')
  const submit = page.getByRole('button', { name: '提交评测' })
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  const verdict = page.locator('.verdict')
  const grade = async (body: string, expected: string) => {
    await source.fill('@startuml\n' + body + '\n@enduml')
    await submit.click()
    await expect(verdict).toHaveText(expected)
  }
  await grade(`class Creator {\nname\n}
class PlatformAccount {\nplatform\nhandle\n}
class Devlog {\ntitle\nurl\n}
class Game {\ntitle\n}
Creator "1" -- "0..*" PlatformAccount
PlatformAccount "1" -- "0..*" Devlog
Devlog "0..*" -- "0..*" Game`, 'ACCEPTED')

  await question.selectOption('renovation-inspections')
  await grade(`class WorkOrder {\norderNo\n}
class WorkItem {\nname\n}
class Inspection {\ncheckedAt\nresult\nnotes\n}
WorkOrder "1" -- "0..*" WorkItem
WorkItem "1" -- "0..*" Inspection`, 'ACCEPTED')

  await question.selectOption('manuscript-reviews')
  const manuscript = `class Manuscript {\ntitle\n}
class Revision {\nversionNo\n}
class Comment {\nbody\n}
Manuscript "1" -- "0..*" Revision\n`
  const direct = 'Revision "1" -- "0..*" Comment'
  const review = 'class Review\nRevision "1" -- "0..*" Review\nReview "1" -- "0..*" Comment'
  await grade(manuscript + direct, 'ACCEPTED')
  await grade(manuscript + review, 'ACCEPTED')
  for (const bad of [
    'Manuscript "1" -- "0..*" Comment',
    'Revision "0..*" -- "0..*" Comment',
    direct + '\n' + review,
    direct + '\nComment "0..*" -- "2" Revision',
  ]) {
    await grade(manuscript + bad, 'WRONG ANSWER')
    await expect(page.getByText(/请选择批注直连版本/)).toBeVisible()
  }
})
