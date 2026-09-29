import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

test('company time zone: an Ontario builder enters and sees Eastern times', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Tom', last: 'Toronto', email: `tom.${id}@tz.test` })
  await createBuilder(page, `Lakeshore Homes ${id}`)
  await page.goto('/settings/company')
  await page.getByLabel('Time zone').selectOption('America/Toronto')
  await page.getByRole('button', { name: 'Save company' }).click()
  await expect(page.getByText(/saved/i).first()).toBeVisible()

  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Oakville ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Oakville ${id}` })).toBeVisible()
  await page.goto('/todos/new')
  await page.getByLabel('Title').fill('Meet the inspector')
  await page.getByLabel('Due date').fill('2026-11-04')
  await page.getByLabel('Due time').fill('10:00')
  await page.getByRole('button', { name: 'Create to-do' }).click()
  await expect(page.getByRole('heading', { name: 'Meet the inspector' })).toBeVisible()
  // stored as 15:00 UTC, shown back as 10:00 a.m. Eastern whatever the server's zone
  await expect(page.getByText(/Due Nov 4, 2026, 10:00\s?a\.m\./)).toBeVisible()
  await page.goto('/bids/new')
  await expect(page.getByText('Eastern time. Subs can\'t submit after this.')).toBeVisible()
})
