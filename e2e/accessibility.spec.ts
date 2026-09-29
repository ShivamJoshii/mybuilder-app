import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signUp, createBuilder, uid } from './helpers'

test('no serious accessibility violations (WCAG 2 AA) on main pages', async ({ page }) => {
  test.setTimeout(240_000)
  const id = uid()
  await signUp(page, { first: 'Ada', last: 'Access', email: `ada.${id}@a11y.test` })
  await createBuilder(page, `Access Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Elm ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Elm ${id}` })).toBeVisible()
  const jobUrl = new URL(page.url()).pathname
  const report: string[] = []
  for (const u of ['/summary', jobUrl, '/jobs', '/todos', '/todos/new', '/daily-logs/new', '/schedule', '/schedule/new', '/change-orders/new', '/selections/new', '/documents', '/estimates', '/bills/new', '/invoices', '/reports', '/time-clock', '/chat', '/settings/company', '/settings/subs', '/settings/import', '/leads', '/leads/new', '/signatures', '/login']) {
    await page.goto(u)
    await page.waitForLoadState('networkidle')
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
      report.push(`${u} [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
    }
  }
  expect(report, report.join('\n')).toEqual([])
})
