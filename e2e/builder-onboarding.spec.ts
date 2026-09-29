import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

test('builder signs up, creates a company and a job', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Priya', last: 'Singh', email: `priya.${id}@alpha.test` })
  await createBuilder(page, `Alpha Homes ${id}`)

  await expect(page.getByRole('heading', { name: 'Create your first job' })).toBeVisible()
  await expect(page.getByText('0 of 6 done.', { exact: false })).toBeVisible()
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

  // Getting started reflects progress and can be hidden
  await page.goto('/summary')
  await expect(page.getByText('1 of 6 done.', { exact: false })).toBeVisible()
  await expect(page.getByText('Create your first job', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hide getting started' }).click()
  await expect(page.getByRole('heading', { name: 'Getting started' })).toHaveCount(0)

  // Bad postal code is rejected
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill('Bad postal')
  await page.getByLabel('Postal code').fill('90210')
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByText('Use a Canadian postal code')).toBeVisible()
})

test('filters, saved views and comments on the jobs list', async ({ page }) => {
  const { signUp: su, createBuilder: cb, uid: u } = await import('./helpers')
  const id = u()
  await su(page, { first: 'Vic', last: 'Views', email: `vic.${id}@alpha.test` })
  await cb(page, `Views Co ${id}`)
  for (const [t, st] of [['Aspen', 'open'], ['Birch', 'presale'], ['Cedar', 'closed']] as const) {
    await page.goto('/jobs/new')
    await page.getByLabel('Job name').fill(t)
    await page.getByLabel('Status').selectOption(st)
    await page.getByRole('button', { name: 'Create job' }).click()
    await expect(page.getByRole('heading', { name: t })).toBeVisible()
  }
  // Comment on a job
  await page.getByLabel('Write a comment').fill('Framing inspection booked for Tuesday')
  await page.getByLabel('Share with subs').check()
  await page.getByRole('button', { name: 'Post comment' }).click()
  await expect(page.locator('li', { hasText: 'Framing inspection booked for Tuesday' })).toBeVisible()

  await page.goto('/jobs')
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Presale').check()
  await page.getByRole('button', { name: 'Apply filter' }).click()
  await expect(page.getByRole('link', { name: 'Birch' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Aspen' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Views', exact: true }).click()
  await page.getByRole('menuitem', { name: /Save current filters/ }).click()
  await page.getByLabel('View name').fill('Presale only')
  await page.getByRole('button', { name: 'Save view' }).click()
  await expect(page.getByRole('button', { name: 'Presale only' })).toBeVisible()

  await page.goto('/comments?tab=comments')
  await page.getByRole('button', { name: /All active jobs|All matching jobs/ }).click()
  await expect(page.getByText('Framing inspection booked for Tuesday')).toBeVisible()
  await page.screenshot({ path: 'test-results/20-comments.png', fullPage: true })

  await page.goto('/search?q=framing')
  await expect(page.getByText('Framing inspection booked for Tuesday')).toBeVisible()
})
