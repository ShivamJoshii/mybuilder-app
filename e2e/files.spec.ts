import { test, expect } from '@playwright/test'
import { signUp, signOut, createBuilder, uid } from './helpers'

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
// 1x1 PNG
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')

test('upload, version, share link, trash and restore', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Fay', last: 'Files', email: `fay.${id}@alpha.test` })
  await createBuilder(page, `File Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Birch ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Birch ${id}` })).toBeVisible()

  await page.goto('/documents')
  await expect(page.getByText('Sub and vendor uploaded files')).toBeVisible()
  await expect(page.getByText('Global Documents')).toBeVisible()
  await page.getByRole('button', { name: 'Add a folder' }).click()
  await page.getByLabel('Folder name').fill('Plans')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await expect(page.getByText('Plans created.')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: /Plans/ }).click()

  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await page.getByLabel('Choose files').setInputFiles({ name: 'A101-floor-plan.pdf', mimeType: 'application/pdf', buffer: pdf })
  await page.getByLabel('Subs and vendors can view').check()
  await page.getByRole('dialog').getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(page.getByRole('link', { name: 'A101-floor-plan.pdf' })).toBeVisible()
  await expect(page.locator('li', { hasText: 'A101-floor-plan.pdf' }).getByText('Subs')).toBeVisible()

  // Download works (signed URL from storage)
  const res = await page.request.get(await page.getByRole('link', { name: 'A101-floor-plan.pdf' }).getAttribute('href') ?? '')
  expect(res.status()).toBe(200)
  expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-')

  // New version keeps history
  await page.locator('li', { hasText: 'A101-floor-plan.pdf' }).getByRole('button', { name: 'New version' }).click()
  await page.getByLabel('Choose files').setInputFiles({ name: 'A101-floor-plan-rev2.pdf', mimeType: 'application/pdf', buffer: pdf })
  await page.getByRole('dialog').getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(page.getByRole('link', { name: 'A101-floor-plan-rev2.pdf' })).toBeVisible()
  await expect(page.getByText(/· v2$/)).toBeVisible()

  // Public share link
  await page.getByRole('button', { name: 'Actions for A101-floor-plan-rev2.pdf' }).click()
  await page.getByRole('menuitem', { name: 'Share link' }).click()
  const link = await page.getByLabel('Share link').inputValue()
  await page.getByRole('button', { name: 'QR code' }).click()
  await expect(page.getByAltText(/QR code/)).toBeVisible()
  await page.screenshot({ path: 'test-results/80-share.png', fullPage: true })
  await page.keyboard.press('Escape')
  const anon = await page.context().browser()!.newContext()
  const pub = await anon.request.get(link)
  expect(pub.status()).toBe(200)
  await anon.close()

  // Trash and restore
  await page.getByRole('button', { name: 'Actions for A101-floor-plan-rev2.pdf' }).click()
  await page.getByRole('menuitem', { name: 'Move to trash' }).click()
  await expect(page.getByRole('link', { name: 'A101-floor-plan-rev2.pdf' })).toHaveCount(0)
  await page.getByRole('link', { name: 'View trash' }).click()
  await page.getByRole('button', { name: 'Restore' }).click()
  await page.goto('/documents')
  await page.getByRole('link', { name: /Plans/ }).click()
  await expect(page.getByRole('link', { name: 'A101-floor-plan-rev2.pdf' })).toBeVisible()

  // Photos show thumbnails
  await page.goto('/photos')
  await page.getByRole('button', { name: 'Add a folder' }).click()
  await page.getByLabel('Folder name').fill('Progress')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: /Progress/ }).click()
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await page.getByLabel('Choose files').setInputFiles({ name: 'framing.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('dialog').getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(page.getByAltText('framing.png')).toBeVisible()
  await page.screenshot({ path: 'test-results/81-photos.png', fullPage: true })
  await signOut(page)
})
