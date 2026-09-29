import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

test('builder schedules linked items; the successor moves with its predecessor', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Sam', last: 'Sched', email: `sam.${id}@alpha.test` })
  await createBuilder(page, `Sched Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Cedar ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Cedar ${id}` })).toBeVisible()

  async function newItem(title: string, start: string, days: number) {
    await page.goto('/schedule/new')
    await page.locator('#title').fill(title)
    await page.getByLabel('Start date').fill(start)
    await page.getByLabel('Duration (workdays)').fill(String(days))
    await page.getByRole('button', { name: 'Create item' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    return page.url().split('/schedule/')[1]
  }
  await newItem('Excavation', '2026-10-05', 2)          // Mon–Tue
  const framing = await newItem('Framing', '2026-10-05', 5)

  // Link framing after excavation with 1 day lag → starts Thu Oct 8
  await page.getByLabel('Predecessor').selectOption({ label: 'Excavation' })
  await page.getByLabel('Lag days').fill('1')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByText('Linked. 1 item moved.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Oct 8, 2026 – Oct 14, 2026')).toBeVisible()

  // Weekend start snaps to Monday
  await newItem('Cleanup', '2026-10-10', 1)
  await expect(page.getByText('Oct 12, 2026 – Oct 12, 2026')).toBeVisible()

  await page.goto('/schedule?view=gantt')
  await page.getByRole('button', { name: /All active jobs/ }).click()
  await expect(page.getByRole('link', { name: 'Framing' }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/60-gantt.png', fullPage: true })
  await page.goto('/schedule?view=calendar')
  await page.screenshot({ path: 'test-results/61-calendar.png', fullPage: true })

  // Go online, then move excavation: framing follows and the shift is logged
  await page.getByRole('button', { name: 'Go online' }).click()
  await expect(page.getByText('Online.')).toBeVisible()
  await page.goto('/schedule?view=list')
  await page.getByRole('link', { name: 'Excavation' }).click()
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByLabel('Duration (workdays)').fill('4')
  await page.getByLabel('Reason for date change').selectOption('Weather')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Oct 5, 2026 – Oct 8, 2026')).toBeVisible()
  await page.goto(`/schedule/${framing}`)
  await expect(page.getByText('Oct 12, 2026 – Oct 16, 2026')).toBeVisible()
  await expect(page.getByText(/moved by a predecessor/)).toBeVisible()
})
