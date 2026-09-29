import { test, expect } from '@playwright/test'
import { signUp, signIn, signOut, createBuilder, uid } from './helpers'

test('web form lead flows into the pipeline and converts to a job', async ({ page }) => {
  const id = uid()
  const email = `lena.${id}@alpha.test`
  await signUp(page, { first: 'Lena', last: 'Leads', email })
  await createBuilder(page, `Lead Homes ${id}`)

  await page.goto('/settings/sales')
  await page.getByLabel('Form name').fill('Website contact')
  await page.getByLabel('Source', { exact: true }).selectOption({ label: 'Website form' })
  await page.getByRole('button', { name: 'Create form' }).click()
  await expect(page.getByText('Form created.')).toBeVisible()
  const formUrl = await page.locator('[data-copy*="/f/"]').first().getAttribute('data-copy')
  await signOut(page)

  // A homeowner fills in the public form (no login)
  await page.goto(new URL(formUrl!).pathname)
  await page.getByLabel('First name').fill('Gurpreet')
  await page.getByLabel('Last name').fill('Dhillon')
  await page.getByLabel('Email').fill(`gd.${id}@home.test`)
  await page.getByLabel('City').fill('Edmonton')
  await page.getByLabel('Tell us about your project').fill('Looking to build a 2,400 sq ft home in Windermere next spring.')
  await page.screenshot({ path: 'test-results/70-public-form.png', fullPage: true })
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Thanks! We’ll be in touch shortly.')).toBeVisible()

  await signIn(page, email)
  await expect(page.getByRole('link', { name: /Notifications, \d+ unread/ })).toBeVisible()
  await page.goto('/leads')
  await expect(page.getByRole('link', { name: 'Gurpreet Dhillon' })).toBeVisible()
  await page.goto('/leads?tab=pipeline')
  await expect(page.getByRole('region', { name: 'New' }).getByText('Gurpreet Dhillon')).toBeVisible()
  await page.screenshot({ path: 'test-results/71-pipeline.png', fullPage: true })

  await page.getByRole('link', { name: 'Gurpreet Dhillon' }).click()
  await expect(page.getByText('Website form: Website contact')).toBeVisible()
  await page.getByLabel('Subject').fill('Intro call')
  await page.getByRole('button', { name: 'Save activity' }).click()
  await expect(page.getByText('Activity scheduled.')).toBeVisible()

  // Estimate before the sale: a Presale job holds the estimate, and converting reuses it
  const leadUrl = page.url()
  await page.getByRole('button', { name: 'Estimate', exact: true }).click()
  await expect(page).toHaveURL(/\/estimates\/[0-9a-f-]{36}/)
  const estJob = page.url().split('/estimates/')[1]
  await page.goto(leadUrl)
  await expect(page.getByRole('link', { name: 'Open estimate' })).toBeVisible()
  await page.getByRole('button', { name: 'Convert to job' }).click()
  await page.getByLabel('Job name').fill(`Dhillon Residence ${id}`)
  await page.getByLabel('Contract price (CAD)').fill('725000')
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Dhillon Residence ${id}` })).toBeVisible()
  expect(page.url()).toContain(`/jobs/${estJob}`)
  await expect(page.getByText('Presale')).toBeVisible()
  await expect(page.locator('li', { hasText: 'Gurpreet Dhillon' })).toBeVisible()
  await expect(page.getByText('$725,000.00')).toBeVisible()
})
