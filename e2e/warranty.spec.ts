import { test, expect } from '@playwright/test'
import { signUp, signIn, signOut, createBuilder, uid } from './helpers'

test('warranty: client reports, builder books a sub, sub completes, client rates', async ({ page }) => {
  test.setTimeout(150_000)
  const id = uid()
  const ownerEmail = `wes.${id}@war.test`
  const clientEmail = `hana.${id}@home.test`
  const subEmail = `pat.${id}@plumb.test`
  await signUp(page, { first: 'Wes', last: 'Warranty', email: ownerEmail })
  await createBuilder(page, `Warranty Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Cedar ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Cedar ${id}` })).toBeVisible()
  await page.getByLabel('First name').fill('Hana')
  await page.getByLabel('Last name').fill('Home')
  await page.locator('#c_email').fill(clientEmail)
  await page.getByRole('button', { name: 'Add client' }).click()
  const clientLink = await page.locator('[data-copy*="/invite/"]').first().getAttribute('data-copy')
  await page.goto('/settings/subs')
  await page.getByRole('button', { name: 'Add sub or vendor' }).click()
  await page.getByLabel('Company name').fill(`Pat Plumbing ${id}`)
  await page.getByLabel('Email').fill(subEmail)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText(`Pat Plumbing ${id} added`)).toBeVisible()
  await page.keyboard.press('Escape')
  const subLink = await page.locator('[data-copy*="/invite/"]').first().getAttribute('data-copy')
  await signOut(page)

  for (const [link, first, last] of [[subLink, 'Pat', 'Plumber'], [clientLink, 'Hana', 'Home']] as const) {
    await page.goto(new URL(link!).pathname)
    await page.getByRole('link', { name: 'Create account' }).click()
    await page.getByLabel('First name').fill(first)
    await page.getByLabel('Last name').fill(last)
    await page.getByLabel('Password').fill('correct-horse-battery')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('button', { name: 'Accept invite' }).click()
    await expect(page).toHaveURL(/\/summary/)
    if (first === 'Pat') await signOut(page)
  }

  // Client reports an issue
  await page.goto('/warranty/new')
  await page.getByLabel('What’s wrong?').fill('Kitchen tap drips')
  await page.getByLabel('Where in the home?').fill('Kitchen')
  await page.getByLabel('Priority').selectOption('urgent')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByRole('heading', { name: 'Kitchen tap drips' })).toBeVisible()
  const claimUrl = page.url()
  await signOut(page)

  // Builder assigns and books the plumber
  await signIn(page, ownerEmail)
  await page.goto('/notifications')
  await expect(page.getByText('Warranty claim: Kitchen tap drips')).toBeVisible()
  await page.goto(claimUrl)
  await page.getByLabel('Assigned to', { exact: true }).selectOption({ label: `Pat Plumbing ${id}` })
  await page.getByLabel('Internal notes (your team only)').fill('Client-supplied tap — check warranty terms')
  await page.getByRole('button', { name: 'Save claim' }).click()
  await expect(page.getByText('Claim saved.')).toBeVisible()
  await page.getByLabel('When (Mountain time)').fill('2026-11-02T09:00')
  await page.getByLabel('Technician').selectOption({ label: `Pat Plumbing ${id}` })
  await page.getByRole('button', { name: 'Book visit' }).click()
  await expect(page.getByText('Appointment booked.')).toBeVisible()
  await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible()
  await signOut(page)

  // Sub confirms and completes
  await signIn(page, subEmail)
  await page.goto('/warranty')
  await page.getByRole('link', { name: 'Kitchen tap drips' }).click()
  await expect(page.getByText('Client-supplied tap')).toHaveCount(0)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible()
  await page.getByLabel('What was done').fill('Replaced cartridge')
  await page.getByRole('button', { name: 'Mark complete' }).click()
  await expect(page.getByText('Work done: Replaced cartridge')).toBeVisible()
  await signOut(page)

  // Builder resolves; client rates
  await signIn(page, ownerEmail)
  await page.goto(claimUrl)
  await page.getByLabel('Status').selectOption('resolved')
  await page.getByRole('button', { name: 'Save claim' }).click()
  await expect(page.getByText('Claim saved.')).toBeVisible()
  await signOut(page)
  await signIn(page, clientEmail)
  await page.goto(claimUrl)
  await page.getByRole('radio', { name: '5', exact: true }).check()
  await page.getByLabel('Feedback').fill('Fixed the same day, thanks!')
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByText('Fixed the same day, thanks!')).toBeVisible()
})
