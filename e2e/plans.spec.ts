import path from 'node:path'
import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

const fixture = (f: string) => path.join(__dirname, 'fixtures', f)

test('plans: split a set, read sheet numbers, mark up, new version, compare; specs', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Paula', last: 'Plans', email: `paula.${id}@plans.test` })
  await createBuilder(page, `Plan Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Spruce ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Spruce ${id}` })).toBeVisible()

  await page.goto('/plans/upload')
  await page.getByLabel('Plan file').setInputFiles(fixture('plan-set.pdf'))
  await expect(page.getByText('2 sheets found.')).toBeVisible()
  await expect(page.getByLabel('Sheet number, page 1')).toHaveValue('A-101')
  await expect(page.getByLabel('Sheet number, page 2')).toHaveValue('A-102')
  await expect(page.getByLabel('Discipline, page 1')).toHaveValue('Architectural')
  await page.getByLabel('Title, page 1').fill('Main floor plan')
  await page.getByRole('button', { name: 'Upload plans' }).click()
  await expect(page).toHaveURL(/\/plans$/)
  await expect(page.getByRole('link', { name: 'A-102' })).toBeVisible()
  await page.getByRole('link', { name: 'A-101' }).click()
  await expect(page.getByRole('heading', { name: 'A-101 — Main floor plan' })).toBeVisible()
  await expect(page.getByText('Loading sheet…')).toHaveCount(0, { timeout: 15000 })

  // Revision cloud + text
  await page.getByRole('button', { name: 'Revision cloud' }).click()
  const layer = page.getByTestId('markup-layer')
  const b = (await layer.boundingBox())!
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width * 0.35, b.y + b.height * 0.3, { steps: 5 })
  await page.mouse.move(b.x + b.width * 0.45, b.y + b.height * 0.4, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Text' }).click()
  await page.getByLabel('Markup text').fill('Confirm window size')
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.45)
  await expect(layer.locator('[data-shape="cloud"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Save markup' }).click()
  await expect(page.getByText('Markup saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('markup-layer').locator('[data-shape="cloud"]')).toHaveCount(1)
  await expect(page.getByTestId('markup-layer').getByText('Confirm window size')).toBeVisible()
  await page.screenshot({ path: 'test-results/90-plan-markup.png' })

  // New version, then compare
  await page.getByRole('button', { name: 'New version' }).click()
  await page.getByLabel('Version file').setInputFiles(fixture('a101-rev2.pdf'))
  await page.getByLabel('What changed?').fill('Moved kitchen window east')
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(page.getByText('v2', { exact: true })).toBeVisible()
  await expect(page.getByText('“Moved kitchen window east”')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Version')).toHaveValue('2')
  await expect(page.getByTestId('markup-layer').locator('[data-shape="cloud"]')).toHaveCount(0)   // markups stay on v1
  await expect(page.getByText('Loading sheet…')).toHaveCount(0, { timeout: 15000 })
  await page.getByLabel('Compare with').selectOption('1')
  await expect(page.getByText(/Comparing version 2 with version 1/)).toBeVisible()
  await expect(page.getByText('Loading sheet…')).toHaveCount(0, { timeout: 15000 })
  await expect.poll(async () => page.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="Sheet version 2"]') as HTMLCanvasElement | null
    if (!c) return false
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let red = 0, blue = 0
    for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i + 2] < 60) red++; if (d[i + 2] > 200 && d[i] < 60) blue++ }
    return red > 50 && blue > 50
  }), { timeout: 15000 }).toBe(true)
  await page.screenshot({ path: 'test-results/91-plan-compare.png' })

  // Specifications
  await page.goto('/plans/specs/new')
  await page.getByLabel('Division').fill('Finishes')
  await page.getByLabel('Title').fill('Interior paint')
  await page.getByLabel('Specification').fill('All interior walls:\n\n- Benjamin Moore Regal Select, eggshell\n- Two coats over primer')
  await page.getByLabel('Share with the client').check()
  await page.getByRole('button', { name: 'Create specification' }).click()
  await expect(page).toHaveURL(/\/plans\/specs\//)
  await page.goto('/plans?tab=specs')
  await expect(page.getByRole('link', { name: 'Interior paint' })).toBeVisible()
})
