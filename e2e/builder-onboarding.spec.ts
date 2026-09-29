import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

test('builder signs up, creates a company and a job', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Priya', last: 'Singh', email: `priya.${id}@alpha.test` })
  await createBuilder(page, `Alpha Homes ${id}`)

  await expect(page.getByRole('heading', { name: 'Create your first job' })).toBeVisible()
  await page.screenshot({ path: 'test-results/01-summary-empty.png', fullPage: true })

  await page.getByRole('link', { name: 'New job' }).first().click()
  await page.getByLabel('Job name').fill('Lot 12 Maple Crescent')
  await page.getByLabel('Street address').fill('123 Maple Cres NW')
  await page.getByLabel('City').fill('Edmonton')
  await page.getByLabel('Postal code').fill('T5J 0N3')
  await page.getByLabel('Permit number').fill('BP-2026-0042')
  await page.getByLabel('Contract price (CAD)').fill('650000')
  await page.screenshot({ path: 'test-results/02-new-job.png', fullPage: true })
  await page.getByRole('button', { name: 'Create job' }).click()

  await expect(page.getByRole('heading', { name: 'Lot 12 Maple Crescent' })).toBeVisible()
  await expect(page.getByText('$650,000.00')).toBeVisible()
  await page.screenshot({ path: 'test-results/03-job-page.png', fullPage: true })

  await page.goto('/jobs')
  await expect(page.getByRole('link', { name: 'Lot 12 Maple Crescent' })).toBeVisible()
  await page.screenshot({ path: 'test-results/04-jobs-list.png', fullPage: true })

  // Bad postal code is rejected
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill('Bad postal')
  await page.getByLabel('Postal code').fill('90210')
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByText('Use a Canadian postal code')).toBeVisible()
})
