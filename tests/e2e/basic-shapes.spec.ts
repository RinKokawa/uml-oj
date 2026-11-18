import { expect, test } from '@playwright/test'
import { installDrawio } from './fixture'

test('a named basic ellipse participates in synchronization without losing the original drawing', async ({ page }) => {
  await installDrawio(page)
  await page.goto('/')
  await page.getByRole('button', { name: '开始学习：第 1 关：认识类' }).click()
  await expect(page.locator('.statusbar')).toContainText('已同步')
  const frame = page.frameLocator('iframe[title="draw.io 类图画布"]')
  const canvas = frame.getByRole('textbox', { name: '画布 XML' })
  const source = page.getByRole('textbox', { name: 'PlantUML source' })
  const xml = `<mxfile host="embed.diagrams.net"><diagram id="page-1" name="UML"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="edge" edge="1" parent="1" source="class-0" target="oval" style="edgeStyle=orthogonalEdgeStyle;html=1;" value=""><mxGeometry relative="1" as="geometry"/></mxCell><mxCell id="class-0" parent="1" style="swimlane;childLayout=stackLayout;" value="Sister" vertex="1"><mxGeometry x="150" y="160" width="200" height="34" as="geometry"/></mxCell><mxCell id="oval" parent="1" style="ellipse;whiteSpace=wrap;html=1;shapeInside=1;" value="" vertex="1"><mxGeometry x="210" y="251" width="80" height="80" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
  await canvas.fill(xml)
  await frame.getByRole('button', { name: '画布修改' }).click()
  await expect(page.locator('.sync-warning')).toContainText('oval 的类名为空')
  await expect(canvas).toHaveValue(xml)
  await canvas.fill(xml.replace('value="" vertex="1"', 'value="Brother" vertex="1"'))
  await frame.getByRole('button', { name: '画布修改' }).click()
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(source).toHaveValue(/class Sister/)
  await expect(source).toHaveValue(/class Brother/)
  await expect(source).toHaveValue(/Sister.*Brother/)
  await source.click(); await expect(source).toBeEditable()
  await source.fill((await source.inputValue()).replaceAll('Brother', 'Sibling'))
  await expect(page.locator('.statusbar')).toContainText('已同步')
  await expect(canvas).toHaveValue(/ellipse;/)
  await expect(canvas).toHaveValue(/x="210" y="251"/)
  await expect(canvas).toHaveValue(/value="Sibling"/)
})
