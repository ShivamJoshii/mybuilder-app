import { test, expect } from '@playwright/test'
import { signUp, signIn, signOut, createBuilder, uid } from './helpers'

test.use({ permissions: ['geolocation'], geolocation: { latitude: 53.5461, longitude: -113.4938 } })   // Edmonton

test('time clock: crew clocks in/out and adds a shift; manager approves; labour hits the budget', async ({ page }) => {
  test.setTimeout(150_000)
  const id = uid()
  const ownerEmail = `tom.${id}@time.test`
  const crewEmail = `cal.${id}@time.test`
  await signUp(page, { first: 'Tom', last: 'Timer', email: ownerEmail })
  await createBuilder(page, `Time Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Alder ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Alder ${id}` })).toBeVisible()
  const jobUrl = page.url()
  await page.goto('/settings/users')
  await page.getByRole('button', { name: 'Invite user' }).click()
  await page.getByLabel('Email').fill(crewEmail)
  await page.getByLabel('Role').selectOption({ label: 'Field Crew' })
  await page.getByRole('button', { name: 'Create invite' }).click()
  await expect(page.getByText(`Invite created for ${crewEmail}`)).toBeVisible()
  await page.keyboard.press('Escape')
  const link = await page.locator('[data-copy*="/invite/"]').first().getAttribute('data-copy')
  await signOut(page)

  await page.goto(new URL(link!).pathname)
  await page.getByRole('link', { name: 'Create account' }).click()
  await page.getByLabel('First name').fill('Cal')
  await page.getByLabel('Last name').fill('Crew')
  await page.getByLabel('Password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('button', { name: 'Accept invite' }).click()
  await expect(page).toHaveURL(/\/summary/)
  await signOut(page)

  // Owner gives Cal the job and a rate
  await signIn(page, ownerEmail)
  await page.goto(jobUrl)
  await page.getByRole('listitem').filter({ hasText: 'Cal Crew' }).getByRole('button', { name: 'Give access' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Cal Crew' }).getByRole('button', { name: 'Has access' })).toBeVisible()
  await page.goto('/time-clock?tab=rates')
  await page.getByLabel('Hourly cost for Cal Crew').fill('45')
  await page.getByRole('button', { name: 'Save rates' }).click()
  await expect(page.getByText('$45.00/h')).toBeVisible()
  await signOut(page)

  // Cal clocks in and out, then adds yesterday by hand
  await signIn(page, crewEmail)
  await page.goto('/time-clock')
  await page.getByLabel('Job to clock in to').selectOption({ label: `Alder ${id}` })
  await page.getByRole('button', { name: 'Clock in' }).click()
  await expect(page.getByText('Clocked in', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Clock out' }).click()
  await expect(page.getByRole('button', { name: 'Clock in' })).toBeVisible()
  await page.locator('select[name="job"]').selectOption({ label: `Alder ${id}` })
  await page.locator('input[name="start"]').fill('07:00')
  await page.locator('input[name="end"]').fill('17:30')
  await page.locator('input[name="break_minutes"]').fill('30')
  await page.getByRole('button', { name: 'Add shift' }).click()
  await expect(page.getByText('Shift added and submitted for approval.')).toBeVisible()
  await expect(page.getByTestId('ot-hours')).toHaveText('2.00')      // 10 h day in Alberta → 2 h OT
  await signOut(page)

  // Owner approves the week
  await signIn(page, ownerEmail)
  await page.goto('/time-clock?tab=team')
  for (const box of await page.getByRole('checkbox', { name: /Select shift Cal Crew/ }).all()) await box.check()
  await page.getByRole('button', { name: 'Approve selected' }).click()
  await expect(page.getByText('Needs approval')).toHaveCount(0)
  const csv = await page.request.get(`/time-clock/export`)
  expect(await csv.text()).toContain('Crew,Cal')
  await page.goto('/budget')
  await expect(page.getByTestId('budget-actual')).toHaveText(/\$45[0-9],?[0-9]*\.\d\d/)   // ~10 h × $45
})
