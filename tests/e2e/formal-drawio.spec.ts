import { expect, test } from '@playwright/test'

const fixture = `<!doctype html><html><body>
<textarea aria-label="画布 XML" id="xml"></textarea>
<input aria-label="未提交的画布文字" id="pending" />
<button id="autosave">画布修改</button>
<button id="fail">快照失败</button>
<script>
let fail = false;
const send = value => parent.postMessage(JSON.stringify(value), '*');
addEventListener('message', event => {
  let m; try { m = JSON.parse(event.data) } catch { return }
  if (m.action === 'load') { document.querySelector('#xml').value = m.xml; send({event:'load'}) }
  if (m.action === 'resetEditor' && document.querySelector('#pending').value) {
    document.querySelector('#xml').value = document.querySelector('#xml').value.replace('value="Student"', 'value="' + document.querySelector('#pending').value + '"');
    document.querySelector('#pending').value = '';
  }
  if (m.action === 'export') setTimeout(() => send({event:'export',format:'xml',xml:fail ? '' : document.querySelector('#xml').value,message:m}), 30)
});
document.querySelector('#autosave').onclick = () => send({event:'autosave',xml:document.querySelector('#xml').value});
document.querySelector('#fail').onclick = () => { fail = true };
send({event:'init'});
</script></body></html>`

test.beforeEach(async ({ page }) => {
  await page.route('https://embed.diagrams.net/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture }))
})

test('draw.io is the default canvas, synchronizes both directions, judges and restores', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  const canvas = frame.getByRole('textbox', { name: '画布 XML' })
  await expect(canvas).toBeVisible()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await source.click()
  await expect(source).toBeEditable()
  await source.fill('@startuml\nclass Student\n@enduml')
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(canvas).toHaveValue(/value="Student"/)
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.getByText('本关通过！')).toBeVisible()
  await canvas.fill((await canvas.inputValue()).replace('value="Student"', 'value="Learner"'))
  await frame.getByRole('button', { name: '画布修改' }).click()
  await expect(source).toHaveValue(/class Learner/)
  await page.reload()
  await expect(page.frameLocator('iframe[title="draw.io 类图画布"]').getByRole('textbox', { name: '画布 XML' })).toHaveValue(/value="Learner"/)
  await expect(source).toHaveValue(/class Learner/)
})

test('mobile can switch between the formal canvas and the same source', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await source.click(); await expect(source).toBeEditable()
  await source.fill('@startuml\nclass Student\n@enduml')
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await page.getByRole('button', { name: 'draw.io 画布' }).click()
  const canvas = page.frameLocator('iframe[title="draw.io 类图画布"]').getByRole('textbox', { name: '画布 XML' })
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveValue(/value="Student"/)
  await page.getByRole('button', { name: '源码模式' }).click()
  await expect(source).toBeVisible()
  await expect(source).toHaveValue(/class Student/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

test('invalid source cannot replace or judge an old draw.io answer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  const canvas = frame.getByRole('textbox', { name: '画布 XML' })
  await expect(canvas).toBeVisible()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await source.click(); await expect(source).toBeEditable()
  await source.fill('@startuml\nclass Student\n@enduml')
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(canvas).toHaveValue(/value="Student"/)
  await source.fill('@startuml\ninterface Student\n@enduml')
  await expect(page.locator('.statusbar')).toContainText('未同步')
  await expect(canvas).toHaveValue(/value="Student"/)
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.locator('.error-report')).toBeVisible()
  await expect(source).toHaveValue(/interface Student/)
})
