import { expect, test } from '@playwright/test'

test.describe('touch canvas', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('a swipe on empty canvas brings Loan into reach', async ({ page, context }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '正式挑战', exact: true }).click()
    await page.getByRole('button', { name: '开始作答：图书借阅系统' }).click()
    await page.getByRole('textbox', { name: 'PlantUML source' }).fill('@startuml\nclass Reader\nclass Book\nclass Loan\n@enduml')
    await page.getByRole('button', { name: '画布模式' }).tap()
    const canvas = page.locator('.canvas-scroll')
    const loan = page.getByRole('button', { name: '编辑类 Loan' })
    await expect(loan).toBeAttached()
    await canvas.scrollIntoViewIfNeeded()
    const bounds = (await canvas.boundingBox())!
    expect((await loan.boundingBox())!.x).toBeGreaterThan(bounds.x + bounds.width)
    const cdp = await context.newCDPSession(page)
    const y = Math.round(bounds.y + 120)
    const x = Math.round(bounds.x + bounds.width - 25)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let dx = 30; dx <= 240; dx += 30) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - dx, y }] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => canvas.evaluate(el => el.scrollLeft)).toBeGreaterThan(150)
    const node = (await loan.boundingBox())!
    expect(node.x + node.width / 2).toBeLessThan(bounds.x + bounds.width)
    await page.touchscreen.tap(node.x + node.width / 2, node.y + node.height / 2)
    await expect(page.getByLabel('类名', { exact: true })).toHaveValue('Loan')
  })
})

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
