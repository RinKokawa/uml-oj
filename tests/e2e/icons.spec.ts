import { expect, test } from '@playwright/test'

test('UI uses decorative Lucide SVGs while controls keep their accessible names', async ({ page }) => {
  await page.goto('/')
  const lightToggle = page.getByRole('button', { name: '切换到亮色模式', exact: true })
  await expect(lightToggle.locator('svg.lucide-sun')).toBeVisible()
  await lightToggle.click()
  const darkToggle = page.getByRole('button', { name: '切换到暗色模式', exact: true })
  await expect(darkToggle.locator('svg.lucide-moon')).toBeVisible()
  await darkToggle.click()

  const enter = page.getByRole('button', { name: '开始学习：第 1 关：认识类', exact: true })
  await expect(enter.locator('svg.lucide-arrow-right')).toBeVisible()
  await enter.click()
  await expect(page.getByRole('button', { name: '返回教学关卡', exact: true }).locator('svg.lucide-arrow-left')).toBeVisible()
  await expect(page.getByRole('button', { name: 'PlantUML 源码模式', exact: true }).locator('svg.lucide-code-xml')).toBeVisible()
  await expect(page.getByRole('button', { name: '切换到可视化绘图', exact: true }).locator('svg.lucide-network')).toBeVisible()

  const submit = page.getByRole('button', { name: '提交评测', exact: true })
  await expect(submit.locator('svg.lucide-play')).toBeVisible()
  await submit.click()
  await expect(page.locator('.result-icon svg.lucide-x')).toBeVisible()
  await page.getByRole('textbox', { name: 'PlantUML source' }).fill('@startuml\nclass Student\n@enduml')
  await submit.click()
  await expect(page.locator('.result-icon svg.lucide-check')).toBeVisible()
  await expect(page.locator('.verdict')).toHaveText('本关通过！')
  await expect(page.getByLabel('选择教学关卡').locator('option:checked')).toHaveText('1. 第 1 关：认识类（已完成）')

  // Check all application SVGs, including ones in currently collapsed panels.
  const attributes = await page.locator('svg.app-icon').evaluateAll(icons => icons.map(icon => ({
    namespace: icon.namespaceURI,
    hidden: icon.getAttribute('aria-hidden'),
    stroke: icon.getAttribute('stroke'),
    strokeWidth: icon.getAttribute('stroke-width'),
    size: icon.getAttribute('width'),
    tabIndex: icon.getAttribute('tabindex'),
  })))
  expect(attributes.length).toBeGreaterThan(15)
  for (const icon of attributes) {
    expect(icon.namespace).toBe('http://www.w3.org/2000/svg')
    expect(icon.hidden).toBe('true')
    expect(icon.stroke).toBe('currentColor')
    expect(icon.strokeWidth).toBe('2')
    expect(['7', '12', '14', '16']).toContain(icon.size)
    expect(icon.tabIndex).toBeNull()
  }
  await page.getByRole('button', { name: '返回教学关卡', exact: true }).click()
  await expect(page.locator('.catalog-row').first().locator('.catalog-status svg.lucide-check')).toBeVisible()
  await expect(page.locator('.catalog-row').first().locator('.catalog-status')).toHaveText('已完成')
})

test('SVG disclosure indicators follow keyboard toggles and fit narrow layouts in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类', exact: true }).click()
  const guide = page.getByRole('button', { name: '知识讲解与操作步骤', exact: true })
  await expect(guide.locator('svg.lucide-chevron-up')).toBeVisible()
  await guide.click()
  await expect(guide).toHaveAttribute('aria-expanded', 'false')
  await expect(guide.locator('svg.lucide-chevron-down')).toBeVisible()

  const hint = page.locator('.hint').first()
  const summary = hint.locator('summary')
  await summary.focus()
  await summary.press('Enter')
  await expect(hint).toHaveAttribute('open', '')
  await expect(summary.locator('svg.disclosure-icon')).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)')
  await summary.press('Enter')
  await expect(hint).not.toHaveAttribute('open', '')
  await expect(summary.locator('svg.disclosure-icon')).toHaveCSS('transform', 'none')
  await expect(page.locator('.select-chevron')).toHaveCSS('pointer-events', 'none')

  for (const theme of ['dark', 'light'] as const) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('link', { name: '开始作答', exact: true }).locator('svg.lucide-arrow-down')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    const source = page.getByRole('textbox', { name: 'PlantUML source' })
    await source.scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: '提交评测', exact: true })).toBeInViewport()
    await expect(page.locator('.sync-indicator svg.lucide-arrow-left-right')).toBeVisible()
    if (theme === 'dark') await page.getByRole('button', { name: '切换到亮色模式', exact: true }).click()
  }
})
