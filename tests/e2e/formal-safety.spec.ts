import { expect, test } from '@playwright/test'

const fixture = `<!doctype html><html><body>
<textarea aria-label="画布 XML" id="xml"></textarea><input aria-label="未提交的画布文字" id="pending" />
<button id="autosave">画布修改</button><button id="fail">快照失败</button>
<script>
let fail = false; window.setSnapshotFailure = value => { fail = value }; const send = value => parent.postMessage(JSON.stringify(value), '*');
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
document.querySelector('#fail').onclick = () => { fail = true }; send({event:'init'});
</script></body></html>`

test.beforeEach(async ({ page }) => {
  await page.context().route('https://embed.diagrams.net/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture }))
})

async function startStudent(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const canvas = page.frameLocator('iframe[title="draw.io 类图画布"]').getByRole('textbox', { name: '画布 XML' })
  await expect(canvas).toBeVisible()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await source.click(); await expect(source).toBeEditable()
  await source.fill('@startuml\nclass Student\n@enduml')
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(canvas).toHaveValue(/value="Student"/)
  await page.locator('.workspace-title').click()
  await expect(page.locator('iframe[title="draw.io 类图画布"]')).not.toHaveAttribute('inert', '')
  return { source, canvas }
}

test('submission commits an active draw.io label edit before reading the model', async ({ page }) => {
  const { source } = await startStudent(page)
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  await frame.getByRole('textbox', { name: '未提交的画布文字' }).fill('Learner')
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(source).toHaveValue(/class Learner/)
  await expect(page.getByText('再试一下，下面还有提示')).toBeVisible()
  await expect(page.getByText('本关通过！')).toHaveCount(0)
})

test('a failed canvas snapshot blocks editing and judging instead of using the last model', async ({ page }) => {
  const { source, canvas } = await startStudent(page)
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  await canvas.fill((await canvas.inputValue()).replace('value="Student"', 'value="Learner"'))
  await frame.getByRole('button', { name: '快照失败' }).click()
  await source.click()
  await expect(page.locator('.sync-warning')).toContainText('无法获取当前画布快照')
  await expect(source).toHaveAttribute('readonly', '')
  await expect(source).toHaveValue(/class Student/)
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.locator('.error-report')).toBeVisible()
  await expect(page.getByText('本关通过！')).toHaveCount(0)
  await expect(canvas).toHaveValue(/value="Learner"/)
})

test('an unconfirmed canvas update cannot be declared synchronized and can be retried', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  const canvas = frame.getByRole('textbox', { name: '画布 XML' })
  await expect(canvas).toBeVisible()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await source.click(); await expect(source).toBeEditable()
  await frame.locator('body').evaluate(() => (window as any).setSnapshotFailure(true))
  await source.fill('@startuml\nclass Student\n@enduml')
  await expect(page.getByRole('button', { name: '重试同步' })).toBeVisible()
  await expect(source).toHaveValue(/class Student/)
  await source.fill('@startuml\nclass Student\n@enduml\n')
  await expect(page.locator('.sync-warning')).toContainText('重试同步')
  await expect(page.getByRole('button', { name: '重试同步' })).toBeVisible()
  await frame.locator('body').evaluate(() => (window as any).setSnapshotFailure(false))
  await page.getByRole('button', { name: '重试同步' }).click()
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(canvas).toHaveValue(/value="Student"/)
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.getByText('本关通过！')).toBeVisible()
})

test('failed source-draft persistence cannot advance the draw.io baseline and lose a newer canvas', async ({ page }) => {
  const { source, canvas } = await startStudent(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'uml-oj-drafts-v2') throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await canvas.fill((await canvas.inputValue()).replace('value="Student"', 'value="Learner"'))
  await page.frameLocator('iframe[title="draw.io 类图画布"]').getByRole('button', { name: '画布修改' }).click()
  await expect(source).toHaveValue(/class Learner/)
  expect(await page.evaluate(() => localStorage.getItem('uml-oj-drawio-base-v2:learn-class'))).toContain('Student')
  const recovered = await page.context().newPage()
  await recovered.goto('/')
  const recoveredSource = recovered.getByRole('textbox', { name: 'PlantUML source' })
  await expect(recoveredSource).toHaveValue(/class Learner/)
  await expect(recovered.frameLocator('iframe[title="draw.io 类图画布"]').getByRole('textbox', { name: '画布 XML' })).toHaveValue(/Learner/)
})

test('divergent restored source and draw.io XML are backed up and require a choice', async ({ page }) => {
  const { source } = await startStudent(page)
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('uml-oj-drawio-base-v2:learn-class'))).toContain('Student')
  await page.addInitScript(() => {
    const drafts = JSON.parse(localStorage.getItem('uml-oj-drafts-v2')!)
    drafts.drafts['learn-class'].source = '@startuml\nclass SourceVersion\n@enduml'
    drafts.drafts['learn-class'].sourceMode = true
    localStorage.setItem('uml-oj-drafts-v2', JSON.stringify(drafts))
    const key = 'uml-oj-drawio-main-v2:learn-class'
    localStorage.setItem(key, localStorage.getItem(key)!.replace('value="Student"', 'value="CanvasVersion"'))
  })
  await page.reload()
  await expect(page.getByText('源码与画布不一致，提交已暂停。', { exact: false })).toBeVisible()
  await expect(source).toHaveValue(/SourceVersion/)
  const canvas = page.frameLocator('iframe[title="draw.io 类图画布"]').getByRole('textbox', { name: '画布 XML' })
  await expect(canvas).toHaveValue(/value="CanvasVersion"/)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '使用源码' }).click()
  await expect(canvas).toHaveValue(/value="SourceVersion"/)
  await expect(page.locator('.statusbar')).toContainText('已同步')
  const backup = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('uml-oj-sync-conflict-v1:learn-class:'))!
    return JSON.parse(localStorage.getItem(key)!)
  })
  expect(backup.source).toContain('SourceVersion')
  expect(backup.drawioXml).toContain('CanvasVersion')
})

test('Mermaid source uses the formal draw.io canvas and can be judged', async ({ page }) => {
  await startStudent(page)
  await page.getByLabel('源码格式').selectOption('mermaid')
  const source = page.getByRole('textbox', { name: 'Mermaid source' })
  await source.click(); await expect(source).toBeEditable()
  await source.fill('classDiagram\nclass Student {\n  -String name\n}')
  await expect(page.locator('.statusbar')).toContainText('已同步')
  const canvas = page.frameLocator('iframe[title="draw.io 类图画布"]').getByRole('textbox', { name: '画布 XML' })
  await expect(canvas).toHaveValue(/name: String/)
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.getByText('本关通过！')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('源码格式')).toHaveValue('mermaid')
  await expect(source).toHaveValue(/class Student/)
})

test('unfinished source survives reload and the last canvas is kept', async ({ page }) => {
  const { source } = await startStudent(page)
  await source.click(); await expect(source).toBeEditable()
  await source.fill('@startuml\ninterface Student\n@enduml')
  await expect(page.locator('.statusbar')).toContainText('未同步')
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('uml-oj-drafts-v2')!).drafts['learn-class'].source)).toContain('interface')
  await page.reload()
  await expect(source).toHaveValue(/interface Student/)
  await expect(page.locator('.statusbar')).toContainText('未同步')
  const canvas = page.frameLocator('iframe[title="draw.io 类图画布"]').getByRole('textbox', { name: '画布 XML' })
  await expect(canvas).toHaveValue(/value="Student"/)
  await source.click(); await expect(source).toBeEditable()
})

test('formal canvas drafts remain separate across problems and theme changes', async ({ page }) => {
  const { source } = await startStudent(page)
  await page.getByLabel('选择教学关卡').selectOption('learn-attribute')
  const canvas = page.frameLocator('iframe[title="draw.io 类图画布"]').getByRole('textbox', { name: '画布 XML' })
  await expect(canvas).toBeVisible()
  await source.click(); await expect(source).toBeEditable()
  await source.fill('@startuml\nclass Student {\n- name: String\n}\n@enduml')
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(canvas).toHaveValue(/name: String/)
  await page.getByRole('button', { name: '切换到亮色模式' }).click()
  await expect(canvas).toHaveValue(/name: String/)
  await page.getByLabel('选择教学关卡').selectOption('learn-class')
  await expect(canvas).toHaveValue(/value="Student"/)
  await expect(canvas).not.toHaveValue(/name: String/)
  await expect(source).toHaveValue('@startuml\nclass Student\n@enduml')
})

test('unsupported draw.io content is retained and blocks judging until fixed', async ({ page }) => {
  const { source, canvas } = await startStudent(page)
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  const clean = await canvas.inputValue()
  const unsupported = clean.replace('</root>', '<mxCell id="note" value="hello" vertex="1" parent="1" style="shape=note;"/></root>')
  await canvas.fill(unsupported)
  await frame.getByRole('button', { name: '画布修改' }).click()
  await expect(page.locator('.sync-warning')).toContainText('未同步')
  await expect(source).toHaveValue(/class Student/)
  await expect(source).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: '提交评测' }).click()
  await expect(page.locator('.error-report')).toBeVisible()
  await expect(canvas).toHaveValue(unsupported)
  await canvas.fill(clean)
  await frame.getByRole('button', { name: '画布修改' }).click()
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await source.click(); await expect(source).toBeEditable()
})

test('a confirmed fresh download allows leaving when canvas storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('uml-oj-drawio-main-v2:')) throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  await expect(frame.getByRole('textbox', { name: '画布 XML' })).toBeVisible()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  await source.click()
  await expect(page.locator('.sync-warning')).toContainText('无法保存')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 .drawio' }).click()
  await downloadPromise
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '确认已保存备份' }).click()
  await page.getByLabel('选择教学关卡').selectOption('learn-attribute')
  await expect(page.getByRole('heading', { name: /第 2 关/ })).toBeVisible()
})

test('source changes preserve a moved class position in the formal draw.io XML', async ({ page }) => {
  const { source, canvas } = await startStudent(page)
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  await canvas.fill((await canvas.inputValue()).replace('x="80" y="80"', 'x="350" y="280"'))
  await frame.getByRole('button', { name: '画布修改' }).click()
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('uml-oj-drawio-main-v2:learn-class'))).toContain('x="350"')
  await source.click(); await expect(source).toBeEditable()
  await source.fill('@startuml\nclass Student {\n  - name: String\n}\n@enduml')
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(canvas).toHaveValue(/x="350"/)
  await expect(canvas).toHaveValue(/y="280"/)
  await expect(canvas).toHaveValue(/name: String/)
})
