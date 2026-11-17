import { expect, test } from '@playwright/test'

// A protocol fixture exercises the host's handling of draw.io messages without
// requiring the public service. It is not a substitute for a live-service test.
const drawioFixture = `<!doctype html><html><body>
<textarea id="xml" aria-label="模拟 draw.io 图"></textarea>
<button id="autosave">模拟自动保存</button>
<button id="fail">模拟快照失败</button>
<script>
let fail = false;
const send = value => parent.postMessage(JSON.stringify(value), '*');
addEventListener('message', event => {
  let message; try { message = JSON.parse(event.data) } catch { return }
  if (message.action === 'load') {
    document.getElementById('xml').value = message.xml || '<mxGraphModel><root/></mxGraphModel>';
    send({event: 'load'});
  }
  if (message.action === 'export') {
    const current = document.getElementById('xml').value;
    setTimeout(() => send({event: 'export', format: 'xml', xml: fail ? '' : current, message}), 100);
  }
});
document.getElementById('autosave').onclick = () => send({event: 'autosave', xml: document.getElementById('xml').value});
document.getElementById('fail').onclick = () => { fail = true };
send({event: 'init'});
</script></body></html>`

const xml1 = '<mxGraphModel><root><mxCell id="student" value="Student"/></root></mxGraphModel>'
const xml2 = '<mxGraphModel><root><mxCell id="course" value="Course"/></root></mxGraphModel>'
const key1 = 'uml-oj-drawio-trial-v1:learn-class'
const key2 = 'uml-oj-drawio-trial-v1:learn-attribute'

test.beforeEach(async ({ page }) => {
  await page.route('https://embed.diagrams.net/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: drawioFixture }))
})

test('trial snapshots current XML before leaving, preserves original draft, and isolates problems', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  const original = '@startuml\nclass Original\n@enduml'
  await source.fill(original)
  await page.getByRole('button', { name: 'draw.io 试用画布' }).click()
  const frame = page.frameLocator('iframe[title="draw.io 类图试用画布"]')
  const canvas = frame.getByRole('textbox', { name: '模拟 draw.io 图' })
  await expect(canvas).toBeVisible()
  await expect(page.getByRole('button', { name: '提交评测' })).toBeDisabled()
  await expect(page.getByText('独立草稿，不与源码或原画布同步，暂不支持提交评测。', { exact: false })).toBeVisible()
  await canvas.fill(xml1) // no autosave: navigation must explicitly request a fresh snapshot
  await page.getByRole('button', { name: 'PlantUML 源码模式' }).click()
  await expect(source).toHaveValue(original)
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key1)).toBe(xml1)
  await page.getByRole('button', { name: 'draw.io 试用画布' }).click()
  await expect(canvas).toHaveValue(xml1)
  await canvas.fill(xml2)
  await frame.getByRole('button', { name: '模拟自动保存' }).click()
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key1)).toBe(xml2)

  // A message from the host origin/window cannot overwrite the iframe draft.
  await page.evaluate(() => window.postMessage(JSON.stringify({ event: 'autosave', xml: '<evil/>' }), '*'))
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key1)).toBe(xml2)
  await page.getByLabel('选择教学关卡').selectOption('learn-attribute')
  await expect(source).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), key2)).toBeNull()
  await page.getByLabel('选择教学关卡').selectOption('learn-class')
  await expect(source).toHaveValue(original)
  await page.getByRole('button', { name: 'draw.io 试用画布' }).click()
  await expect(canvas).toHaveValue(xml2)
})

test('theme reload snapshots first and a failed snapshot prevents navigation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  await page.getByRole('button', { name: 'draw.io 试用画布' }).click()
  const frame = page.frameLocator('iframe[title="draw.io 类图试用画布"]')
  const canvas = frame.getByRole('textbox', { name: '模拟 draw.io 图' })
  await expect(canvas).toBeVisible()
  await canvas.fill(xml1)
  await page.getByRole('button', { name: '切换到亮色模式' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(canvas).toHaveValue(xml1)
  await expect(page.locator('iframe[title="draw.io 类图试用画布"]')).toHaveAttribute('src', /dark=0/)
  await frame.getByRole('button', { name: '模拟快照失败' }).click()
  await page.getByRole('button', { name: 'PlantUML 源码模式' }).click()
  await expect(page.getByText('无法获取当前画布，请重试；切换已取消。')).toBeVisible()
  await expect(page.getByRole('button', { name: 'draw.io 试用画布' })).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas).toHaveValue(xml1)
  expect(await page.evaluate(key => localStorage.getItem(key), key1)).toBe(xml1)
})

test('storage failure blocks switching until the current XML is downloaded', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('uml-oj-drawio-trial-v1:')) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  await page.getByRole('button', { name: 'draw.io 试用画布' }).click()
  const frame = page.frameLocator('iframe[title="draw.io 类图试用画布"]')
  const canvas = frame.getByRole('textbox', { name: '模拟 draw.io 图' })
  await canvas.fill(xml1)
  await page.getByRole('button', { name: 'PlantUML 源码模式' }).click()
  await expect(page.getByText('浏览器存储不可用；请下载 .drawio 文件备份。')).toBeVisible()
  await expect(page.getByRole('button', { name: 'draw.io 试用画布' })).toHaveAttribute('aria-pressed', 'true')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 .drawio' }).click()
  await downloaded
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '确认已保存备份' }).click()
  await page.getByRole('button', { name: 'PlantUML 源码模式' }).click()
  await expect(page.getByRole('textbox', { name: 'PlantUML source' })).toBeVisible()
})

test('mobile trial does not overflow and explicit download contains current XML', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  await page.getByRole('button', { name: 'draw.io 试用画布' }).click()
  const frame = page.frameLocator('iframe[title="draw.io 类图试用画布"]')
  await frame.getByRole('textbox', { name: '模拟 draw.io 图' }).fill(xml1)
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 .drawio' }).click()
  const download = await event
  expect(download.suggestedFilename()).toBe('uml-oj-learn-class.drawio')
  const stream = await download.createReadStream()
  const parts: Buffer[] = []
  for await (const chunk of stream) parts.push(Buffer.from(chunk))
  expect(Buffer.concat(parts).toString('utf8')).toBe(xml1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})
