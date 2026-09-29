import { test, expect, type Page } from '@playwright/test'
import { signUp, signIn, signOut, createBuilder, uid } from './helpers'

async function newJob(page: Page, title: string) {
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(title)
  await page.getByLabel('Contract price (CAD)').fill('500000')
  await page.getByLabel('Internal notes').fill('Margin target 18%')
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  return page.url().split('/jobs/')[1]
}

test('owner adds a sub and a field crew user; each sees only what they should', async ({ page }) => {
  const id = uid()
  const ownerEmail = `owner.${id}@alpha.test`
  const subEmail = `sparky.${id}@sparks.test`
  const crewEmail = `crew.${id}@alpha.test`

  // Owner: company, two jobs
  await signUp(page, { first: 'Olivia', last: 'Owner', email: ownerEmail })
  await createBuilder(page, `Alpha ${id}`)
  const job1 = await newJob(page, `Maple ${id}`)
  await newJob(page, `Oak ${id}`)

  // Add a sub and put them on job 1 only
  await page.goto('/settings/subs')
  await page.getByRole('button', { name: 'Add sub or vendor' }).click()
  await page.getByLabel('Company name').fill(`Sparks Electric ${id}`)
  await page.getByLabel('Email').fill(subEmail)
  await page.getByLabel('Trade').fill('Electrical')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText(`Sparks Electric ${id} added`)).toBeVisible()
  await page.keyboard.press('Escape')
  const subLink = await page.locator('[data-copy*="/invite/"]').first().getAttribute('data-copy')
  expect(subLink).toBeTruthy()
  await page.screenshot({ path: 'test-results/10-subs.png', fullPage: true })

  await page.goto(`/jobs/${job1}`)
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/jobs/')), page.getByRole('button', { name: 'Add to job' }).click()])
  await expect(page.locator('li', { hasText: `Sparks Electric ${id}` })).toBeVisible()

  // Invite a field crew member
  await page.goto('/settings/users')
  await page.getByRole('button', { name: 'Invite user' }).click()
  await page.getByLabel('Email').fill(crewEmail)
  await page.getByLabel('Role').selectOption({ label: 'Field Crew' })
  await page.getByRole('button', { name: 'Create invite' }).click()
  await expect(page.getByText(`Invite created for ${crewEmail}`)).toBeVisible()
  await page.keyboard.press('Escape')
  const crewLink = await page.locator('[data-copy*="/invite/"]').first().getAttribute('data-copy')
  await page.screenshot({ path: 'test-results/11-users.png', fullPage: true })

  // Give crew access to job 1
  await page.goto('/settings/roles')
  await page.screenshot({ path: 'test-results/12-roles.png', fullPage: true })
  await signOut(page)

  // Sub accepts invite
  await page.goto(new URL(subLink!).pathname)
  await page.getByRole('link', { name: 'Create account' }).click()
  await page.getByLabel('First name').fill('Sam')
  await page.getByLabel('Last name').fill('Sparks')
  await page.getByLabel('Password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('button', { name: 'Accept invite' }).click()
  await expect(page).toHaveURL(/\/summary/)
  await page.goto('/jobs')
  await expect(page.getByRole('link', { name: `Maple ${id}` })).toBeVisible()
  await expect(page.getByRole('link', { name: `Oak ${id}` })).toHaveCount(0)
  await page.getByRole('link', { name: `Maple ${id}` }).click()
  await expect(page.getByText('$500,000.00')).toHaveCount(0)
  await expect(page.getByText('Margin target 18%')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Financial' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sales' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/13-sub-job.png', fullPage: true })
  await page.goto('/settings/users')
  await expect(page).toHaveURL(/\/summary/)
  await signOut(page)

  // Crew accepts invite; sees no jobs until given access, never sees pricing
  await page.goto(new URL(crewLink!).pathname)
  await page.getByRole('link', { name: 'Create account' }).click()
  await page.getByLabel('First name').fill('Carl')
  await page.getByLabel('Last name').fill('Crew')
  await page.getByLabel('Password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('button', { name: 'Accept invite' }).click()
  await expect(page).toHaveURL(/\/summary/)
  await expect(page.getByText('No jobs yet')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sales' })).toHaveCount(0)
  await page.goto('/settings/roles')
  await expect(page).toHaveURL(/\/summary\?denied=/)
  await page.goto(`/jobs/${job1}`)
  await expect(page.getByText('This page could not be found')).toBeVisible()
  await signOut(page)

  // Owner gives crew access to job 1
  await signIn(page, ownerEmail)
  await page.goto(`/jobs/${job1}`)
  await page.locator('li', { hasText: 'Carl Crew' }).getByRole('button', { name: 'Give access' }).click()
  await expect(page.locator('li', { hasText: 'Carl Crew' }).getByRole('button', { name: 'Has access' })).toBeVisible()
  await signOut(page)

  await signIn(page, crewEmail)
  await page.goto(`/jobs/${job1}`)
  await expect(page.getByRole('heading', { name: `Maple ${id}` })).toBeVisible()
  await expect(page.getByText('$500,000.00')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Edit job' })).toHaveCount(0)
})
