import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

const csv = (name: string, text: string) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) })

test('import: jobs, leads, subs and cost codes from Buildertrend-style CSVs', async ({ page }) => {
  test.setTimeout(120_000)
  const id = uid()
  await signUp(page, { first: 'Ivy', last: 'Import', email: `ivy.${id}@import.test` })
  await createBuilder(page, `Import Homes ${id}`)
  await page.goto('/settings/import')

  // Jobs, with a bad postal code on one row
  await page.getByLabel('CSV file').setInputFiles(csv('jobs.csv',
    'Job Name,Job Status,Street Address,City,State,Zip,Projected Start,Contract Price\n' +
    `"Birch ${id}",Open,12 Birch Ave,Calgary,AB,T2N1A1,3/2/2027,"$650,000"\n` +
    `"Cedar ${id}",Presale,,Edmonton,Alberta,T5J 0N3,,\n` +
    `"Broken ${id}",Open,,Toronto,ON,90210,,\n`))
  await expect(page.getByLabel('Column for Job name')).toHaveValue('0')
  await expect(page.getByLabel('Column for Postal code')).toHaveValue('5')
  await page.getByRole('button', { name: 'Import 3 jobs' }).click()
  await expect(page.getByTestId('import-result')).toContainText('2 imported, 1 skipped')
  await expect(page.getByTestId('import-result')).toContainText('Row 4: Postal code “90210” isn’t Canadian')

  // Leads
  await page.getByLabel('What are you importing?').selectOption('leads')
  await page.getByLabel('CSV file').setInputFiles(csv('leads.csv',
    'Opportunity Title,First Name,Last Name,Email,Phone,Confidence,Estimated Revenue,Notes\n' +
    `"Singh custom home ${id}",Aman,Singh,aman@example.com,780-555-0101,60%,"$900,000",Wants a walkout basement\n`))
  await page.getByRole('button', { name: 'Import 1 leads' }).click()
  await expect(page.getByTestId('import-result')).toContainText('1 imported')

  // Subs
  await page.getByLabel('What are you importing?').selectOption('subs')
  await page.getByLabel('CSV file').setInputFiles(csv('subs.csv',
    'Company Name,Division,Email,Phone\n' + `"Sparky ${id}",Electrical,sparky.${id}@elec.test,403-555-0199\n` + `"No Email ${id}",Plumbing,,\n`))
  await page.getByRole('button', { name: 'Import 2 subs and vendors' }).click()
  await expect(page.getByTestId('import-result')).toContainText('1 imported, 1 skipped')

  // Cost codes (one duplicate of a starter code is skipped)
  await page.getByLabel('What are you importing?').selectOption('cost_codes')
  await page.getByLabel('CSV file').setInputFiles(csv('codes.csv', 'Cost Code,Title,Category,Labor\n90-100,Snow removal,Site services,yes\n90-110,Hoarding,Site services,no\n'))
  await page.getByRole('button', { name: 'Import 2 cost codes' }).click()
  await expect(page.getByTestId('import-result')).toContainText('2 imported')

  // Everything landed
  await page.goto('/jobs')
  await expect(page.getByRole('link', { name: `Birch ${id}` })).toBeVisible()
  await expect(page.getByRole('link', { name: `Cedar ${id}` })).toBeVisible()
  await page.goto('/leads')
  await expect(page.getByText(`Singh custom home ${id}`).first()).toBeVisible()
  await page.goto('/settings/subs')
  await expect(page.getByRole('link', { name: `Sparky ${id}` })).toBeVisible()
  await page.goto('/settings/cost-codes')
  await expect(page.getByText('Snow removal')).toBeVisible()
})
