import { expect, test } from '@playwright/test'
import { installDrawio } from './fixture'

test('a pasted class declaration is repaired only after confirmation and backup', async ({ page }) => {
  await installDrawio(page)
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  await expect(page.locator('.statusbar')).toContainText('已同步')
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  const canvas = frame.getByRole('textbox', { name: '画布 XML' })
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  const xml = `<mxfile host="embed.diagrams.net"><diagram id="page-1" name="UML"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="class-0" parent="1" style="swimlane;childLayout=stackLayout;html=0;" value="class Student&#xa;@enduml" vertex="1"><mxGeometry x="150" y="160" width="200" height="34" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
  await canvas.fill(xml)
  await frame.getByRole('button', { name: '画布修改' }).click()
  await expect(page.locator('.sync-warning')).toContainText('类标题（图形 ID：class-0）')
  const repair = page.getByRole('button', { name: '修复类标题' })
  await expect(repair).toBeVisible()
  const cancelDialog = page.waitForEvent('dialog')
  await repair.click()
  await (await cancelDialog).dismiss()
  await expect(repair).toBeEnabled()
  await expect(canvas).toHaveValue(xml)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    ;(window as any).restoreStorage = () => { Storage.prototype.setItem = original }
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('uml-oj-class-title-repair-v1:')) throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  const failedBackupDialog = page.waitForEvent('dialog')
  await repair.click()
  await (await failedBackupDialog).accept()
  await expect(page.locator('.sync-warning')).toContainText('无法备份')
  await expect(canvas).toHaveValue(xml)
  await page.evaluate(() => (window as any).restoreStorage())
  const confirmDialog = page.waitForEvent('dialog')
  await repair.click()
  await (await confirmDialog).accept()
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(canvas).toHaveValue(/value="Student"/)
  await expect(canvas).toHaveValue(/x="150"/)
  await expect(source).toHaveValue(/class Student/)
  const backup = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('uml-oj-class-title-repair-v1:learn-class:'))!
    return JSON.parse(localStorage.getItem(key)!)
  })
  expect(backup.drawioXml).toBe(xml)
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.getByText('本关通过！')).toBeVisible()
})
