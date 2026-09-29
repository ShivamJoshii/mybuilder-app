import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

test('builder writes a daily log with weather, tags and a draft', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Dana', last: 'Logs', email: `dana.${id}@alpha.test` })
  await createBuilder(page, `Log Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Willow ${id}`)
  await page.getByLabel('City').fill('Edmonton')
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Willow ${id}` })).toBeVisible()

  // Draft first
  await page.goto('/daily-logs/new')
  await page.getByLabel('Title', { exact: true }).fill('Draft notes')
  await page.getByLabel('Notes', { exact: false }).and(page.locator('textarea')).fill('Half done, finish later')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page).toHaveURL(/\/daily-logs\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()

  // Published log with weather + new tag
  await page.goto('/daily-logs/new')
  await page.getByLabel('Title', { exact: true }).fill('Framing day 3')
  await page.getByLabel('Notes', { exact: false }).and(page.locator('textarea')).fill('Second floor walls up. Truss delivery pushed to Friday.')
  await expect(page.getByTestId('weather')).toBeVisible({ timeout: 15000 })
  await page.getByLabel('New tags').fill('Delivery postponed')
  await page.getByLabel('Subs and vendors').check()
  await page.screenshot({ path: 'test-results/40-log-form.png', fullPage: true })
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('heading', { name: 'Framing day 3' })).toBeVisible()
  await expect(page.getByText('Delivery postponed')).toBeVisible()
  await expect(page.getByText('Shared with subs')).toBeVisible()
  await page.screenshot({ path: 'test-results/41-log.png', fullPage: true })

  // Too-long title is blocked by the field
  await page.goto('/daily-logs/new')
  await expect(page.getByLabel('Title', { exact: true })).toHaveAttribute('maxlength', '50')

  await page.goto('/daily-logs')
  await expect(page.getByText('Second floor walls up')).toBeVisible()
  await expect(page.getByText('Half done, finish later')).toBeVisible()
  await page.screenshot({ path: 'test-results/42-logs.png', fullPage: true })
})
