import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

test('audit log shows who changed what', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Al', last: 'Auditor', email: `al.${id}@audit.test` })
  await createBuilder(page, `Audit Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Maple ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Maple ${id}` })).toBeVisible()
  await page.getByRole('link', { name: 'Edit job' }).click()
  await page.getByLabel('Job name').fill(`Maple Court ${id}`)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: `Maple Court ${id}` })).toBeVisible()

  await page.goto('/settings/audit?table=jobs')
  const row = page.getByRole('row', { name: /Changed/ }).first()
  await expect(row).toContainText('Al Auditor')
  await expect(row).toContainText(`title: Maple ${id} → Maple Court ${id}`)
  await expect(page.getByRole('row', { name: /Added/ }).first()).toContainText(`Job: Maple`)
})
