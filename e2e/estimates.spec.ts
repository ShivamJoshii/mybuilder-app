import { test, expect } from '@playwright/test'
import { signUp, signIn, signOut, createBuilder, uid } from './helpers'

test('estimate → proposal → client e-signature → budget', async ({ page }) => {
  const id = uid()
  const ownerEmail = `eve.${id}@est.test`
  const clientEmail = `home.${id}@owner.test`
  await signUp(page, { first: 'Eve', last: 'Estimator', email: ownerEmail })
  await createBuilder(page, `Estimate Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Birch ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Birch ${id}` })).toBeVisible()
  const jobUrl = page.url()
  const jobId = jobUrl.split('/jobs/')[1]

  // Client on the job, invited to the portal
  await page.getByLabel('First name').fill('Hanna')
  await page.getByLabel('Last name').fill('Home')
  await page.locator('#c_email').fill(clientEmail)
  await page.getByRole('button', { name: 'Add client' }).click()
  const invite = page.locator('[data-copy*="/invite/"]').first()
  await expect(invite).toBeVisible()
  const link = await invite.getAttribute('data-copy')

  // Build the estimate
  await page.goto(`/estimates/${jobId}`)
  await page.getByRole('button', { name: 'Start estimate' }).click()
  await page.getByRole('button', { name: 'Add group' }).click()
  await page.getByLabel('Group name').fill('Framing')
  await page.getByRole('button', { name: 'Add line' }).first().click()
  await page.getByLabel('Line title').last().fill('Framing lumber')
  await page.getByLabel('Quantity').last().fill('10')
  await page.getByLabel('Unit cost').last().fill('100')
  await page.getByRole('button', { name: 'Add line' }).first().click()
  await page.getByLabel('Line title').last().fill('Framing labour')
  await page.getByLabel('Unit cost').last().fill('500')
  await page.getByLabel('Markup type').last().selectOption('amount')
  await page.getByLabel('Markup', { exact: true }).last().fill('250')
  await page.getByLabel('Cost type').last().selectOption('labor')
  await expect(page.getByText('$1,950.00').first()).toBeVisible()
  await expect(page.getByText('$2,047.50')).toBeVisible()
  await page.getByRole('button', { name: 'Save estimate' }).click()
  await expect(page.getByText('Estimate saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Line title').first()).toHaveValue('Framing lumber')
  await page.screenshot({ path: 'test-results/60-estimate.png', fullPage: true })

  // Proposal
  await page.getByRole('button', { name: 'Create proposal' }).click()
  await expect(page.getByRole('heading', { name: `Birch ${id} proposal` })).toBeVisible()
  await expect(page.getByTestId('proposal-total')).toHaveText('$2,047.50')
  await page.getByRole('button', { name: 'Release to client' }).click()
  await page.getByRole('button', { name: 'Release', exact: true }).click()
  await expect(page.getByText('Awaiting client')).toBeVisible()
  await page.screenshot({ path: 'test-results/61-proposal.png', fullPage: true })
  await signOut(page)

  // Client signs
  await page.goto(new URL(link!).pathname)
  await page.getByRole('link', { name: 'Create account' }).click()
  await page.getByLabel('First name').fill('Hanna')
  await page.getByLabel('Last name').fill('Home')
  await page.getByLabel('Password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('button', { name: 'Accept invite' }).click()
  await expect(page).toHaveURL(/\/summary/)
  await page.goto('/proposals')
  await page.getByRole('link', { name: `Birch ${id} proposal` }).click()
  await expect(page.getByTestId('proposal-total')).toHaveText('$2,047.50')
  await expect(page.getByText('Builder cost')).toHaveCount(0)
  await page.getByRole('button', { name: 'Approve and sign' }).click()
  await expect(page.getByText('Confirm that you agree before approving.')).toBeVisible()
  await page.getByLabel(/I agree that my electronic signature/).check()
  await page.getByRole('button', { name: 'Approve and sign' }).click()
  await expect(page.getByText(/Approved by Hanna Home/)).toBeVisible()
  await page.screenshot({ path: 'test-results/62-signed.png', fullPage: true })
  await signOut(page)

  // Builder sends to budget, estimate locks
  await signIn(page, ownerEmail)
  await page.goto(`/estimates/${jobId}`)
  await page.getByRole('button', { name: 'Send to budget' }).click()
  await page.getByRole('button', { name: 'Send to budget' }).last().click()
  await expect(page.getByText(/Sent to budget/).first()).toBeVisible()
  await expect(page.getByLabel('Line title').first()).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible()
})
