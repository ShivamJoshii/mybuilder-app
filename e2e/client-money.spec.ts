import { test, expect } from '@playwright/test'
import { signUp, signIn, signOut, createBuilder, uid } from './helpers'

test('open-book job: builder lets the client see the contract, costs and bills', async ({ page }) => {
  test.setTimeout(150_000)
  const id = uid()
  const ownerEmail = `obi.${id}@open.test`
  const clientEmail = `cara.${id}@home.test`
  await signUp(page, { first: 'Obi', last: 'Open', email: ownerEmail })
  await createBuilder(page, `Open Book Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Reno ${id}`)
  await page.getByLabel('Contract type').selectOption('open_book')
  await page.getByLabel('Contract price (CAD)').fill('250000')
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Reno ${id}` })).toBeVisible()
  const jobUrl = page.url()
  await page.getByLabel('First name').fill('Cara')
  await page.getByLabel('Last name').fill('Client')
  await page.locator('#c_email').fill(clientEmail)
  await page.getByRole('button', { name: 'Add client' }).click()
  const link = await page.locator('[data-copy*="/invite/"]').first().getAttribute('data-copy')
  // Per-job portal: show the money
  await page.getByLabel('Sees the contract and payments summary').check()
  await page.getByLabel('Sees purchase orders and bills (open-book)').check()
  await page.getByRole('button', { name: 'Save portal settings' }).click()
  await expect(page.getByText('Client portal settings saved for this job.')).toBeVisible()

  // A vendor bill, approved
  await page.goto('/bills/new')
  await page.getByLabel('Sub or vendor').selectOption('vendor')
  await page.getByLabel('Vendor name').fill('Kent Building Supplies')
  await page.getByLabel('Title').fill('Drywall and mud')
  await page.getByLabel('Description').fill('Drywall sheets')
  await page.getByLabel('Amount', { exact: true }).fill('1800')
  await page.getByRole('button', { name: 'Save bill' }).click()
  await expect(page).toHaveURL(/\/bills\/[0-9a-f-]{36}/)
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByRole('button', { name: 'Unapprove' })).toBeVisible()
  await signOut(page)

  // Client joins and sees it
  await page.goto(new URL(link!).pathname)
  await page.getByRole('link', { name: 'Create account' }).click()
  await page.getByLabel('First name').fill('Cara')
  await page.getByLabel('Last name').fill('Client')
  await page.getByLabel('Password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('button', { name: 'Accept invite' }).click()
  await expect(page).toHaveURL(/\/summary/)
  await page.goto(new URL(jobUrl).pathname)
  await expect(page.getByRole('heading', { name: 'Your contract' })).toBeVisible()
  await expect(page.getByText('$250,000.00').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Purchase orders and bills' })).toBeVisible()
  await expect(page.getByText('Kent Building Supplies')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Budget and costs to date' })).toBeVisible()   // on by default for open-book jobs
  await signOut(page)
  await signIn(page, ownerEmail)
})
