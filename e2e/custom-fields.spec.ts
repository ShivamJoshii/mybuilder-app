import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

test('custom fields: define in settings, fill on a job, validation keeps input', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Cory', last: 'Fields', email: `cory.${id}@fields.test` })
  await createBuilder(page, `Field Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Birch ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Birch ${id}` })).toBeVisible()
  const jobUrl = page.url()

  await page.goto('/settings/custom-fields')
  await page.getByLabel('Label').fill('Siding colour')
  await page.getByLabel('Type').selectOption('single_select')
  await page.getByLabel('Options').fill('Charcoal\nWhite')
  await page.getByLabel('Visible to clients').check()
  await page.getByRole('button', { name: 'Add field' }).click()
  await expect(page.getByText('Siding colour added.')).toBeVisible()
  await page.getByLabel('Label').fill('Engineer drawings')
  await page.getByLabel('Type').selectOption('hyperlink')
  await page.getByRole('button', { name: 'Add field' }).click()
  await expect(page.getByText('Engineer drawings added.')).toBeVisible()

  await page.goto(jobUrl)
  await expect(page.getByText('Shown to clients')).toBeVisible()
  await page.getByLabel('Siding colour').selectOption('Charcoal')
  await page.getByLabel('Engineer drawings').fill('ftp://files.example.com/x')
  // the browser's own url check would block ftp; bypass it to hit the server check
  await page.locator('form:has([aria-label="Engineer drawings"])').evaluate((f) => f.setAttribute('novalidate', ''))
  await page.getByRole('button', { name: 'Save fields' }).click()
  await expect(page.getByText('Engineer drawings: links start with https://')).toBeVisible()
  await expect(page.getByLabel('Siding colour')).toHaveValue('Charcoal')
  await page.getByLabel('Engineer drawings').fill('https://files.example.com/eng.pdf')
  await page.getByRole('button', { name: 'Save fields' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Siding colour')).toHaveValue('Charcoal')
  await expect(page.getByLabel('Engineer drawings')).toHaveValue('https://files.example.com/eng.pdf')

  // "Show in filters": the jobs list filters by the field
  const field = await page.getByLabel('Siding colour').getAttribute('name')
  await page.goto(`/jobs?${field}=Charcoal`)
  await expect(page.getByRole('link', { name: `Birch ${id}` })).toBeVisible()
  await page.goto(`/jobs?${field}=White`)
  await expect(page.getByRole('link', { name: `Birch ${id}` })).toHaveCount(0)
})
