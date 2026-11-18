import { expect, test } from '@playwright/test'
import { installDrawio } from './fixture'

test.beforeEach(async ({ page }) => installDrawio(page))

async function start(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  await expect(page.locator('.statusbar')).toContainText('已同步')
  return page.getByRole('textbox', { name: 'PlantUML source' })
}

test('desktop shows three panes and preserves source formatting until a semantic canvas edit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const source = await start(page)
  const positions = await Promise.all([page.locator('.problem-panel').boundingBox(), page.locator('.visual-pane').boundingBox(), source.boundingBox()])
  expect(positions[0]!.x).toBeLessThan(positions[1]!.x)
  expect(positions[1]!.x).toBeLessThan(positions[2]!.x)
  const text = "@startuml\n' keep comment\nclass Student\n@enduml"
  await source.click(); await expect(source).toBeEditable(); await source.fill(text)
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(source).toHaveValue(text)
  await page.getByRole('button', { name: '编辑类 Student' }).click()
  await page.getByLabel('类名', { exact: true }).fill('Learner')
  await page.getByRole('button', { name: '应用更改' }).click()
  await expect(source).toHaveValue(/class Learner/)
})

test('corrupt current drafts are never replaced by a blank draft', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uml-oj-native-drafts-v1', '{corrupt'))
  const source = await start(page)
  await expect(page.getByText('浏览器存储不可用或草稿无法恢复', { exact: false })).toBeVisible()
  await source.click(); await expect(source).toBeEditable(); await source.fill('@startuml\nclass NewDraft\n@enduml')
  await page.waitForTimeout(700)
  expect(await page.evaluate(() => localStorage.getItem('uml-oj-native-drafts-v1'))).toBe('{corrupt')
})

test('old storage is neither loaded nor modified', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('uml-oj-drafts-v1', 'old draft')
    localStorage.setItem('uml-oj-drawio-main-v1:learn-class', 'old canvas')
  })
  const source = await start(page)
  await expect(source).not.toHaveValue(/old draft/)
  expect(await page.evaluate(() => localStorage.getItem('uml-oj-drafts-v1'))).toBe('old draft')
  expect(await page.evaluate(() => localStorage.getItem('uml-oj-drawio-main-v1:learn-class'))).toBe('old canvas')
})

test('conflict backup failure prevents overwrites, then canvas can be selected', async ({ page }) => {
  const source = await start(page)
  await source.click(); await expect(source).toBeEditable(); await source.fill('@startuml\nclass Student\n@enduml')
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('uml-oj-native-drafts-v1'))).toContain('Student')
  await page.addInitScript(() => {
    const key = 'uml-oj-native-drafts-v1'
    const draft = JSON.parse(localStorage.getItem(key)!)
    draft.drafts['learn-class'].source = '@startuml\nenum Unfinished\n@enduml'
    draft.drafts['learn-class'].model.classes[0].name = 'CanvasVersion'
    localStorage.setItem(key, JSON.stringify(draft))
    const original = Storage.prototype.setItem
    ;(window as any).restoreSetItem = () => { Storage.prototype.setItem = original }
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('uml-oj-native-conflict-v1:')) throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.reload()
  await expect(page.getByText('源码与画布不一致，提交已暂停。', { exact: false })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '使用画布' }).click()
  await expect(page.locator('.statusbar')).toContainText('无法备份冲突内容')
  await expect(source).toHaveValue(/enum Unfinished/)
  await page.evaluate(() => (window as any).restoreSetItem())
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '使用画布' }).click()
  await expect(source).toHaveValue(/class CanvasVersion/)
  await expect(page.locator('.statusbar')).toContainText('已同步')
})
