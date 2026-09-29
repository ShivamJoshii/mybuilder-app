import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

test('job email: send from the job, reply comes back to the thread', async ({ page }) => {
  const id = uid()
  await signUp(page, { first: 'Mia', last: 'Mail', email: `mia.${id}@mail.test` })
  await createBuilder(page, `Mail Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Juniper ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Juniper ${id}` })).toBeVisible()

  await page.goto('/messages')
  const address = (await page.locator('code').first().textContent())!
  expect(address).toMatch(/^job-[0-9a-f]+@in\.mybuilder\.ca$/)
  await page.getByRole('link', { name: 'New message' }).first().click()
  await page.getByLabel('To').fill('supplier@example.com')
  await page.getByLabel('Subject').fill('Window order')
  await page.getByLabel('Message').fill('Please confirm the lead time on the triple-pane units.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('heading', { name: 'Window order' })).toBeVisible()
  await expect(page.getByText('Queued')).toBeVisible()   // no Postmark token locally

  // Supplier replies to the job address (Postmark inbound webhook)
  const bad = await page.request.post('/api/inbound/postmark?secret=wrong', { data: {} })
  expect(bad.status()).toBe(401)
  const res = await page.request.post(`/api/inbound/postmark?secret=${process.env.INBOUND_WEBHOOK_SECRET ?? 'dev-inbound-secret'}`, {
    data: {
      FromFull: { Email: 'supplier@example.com', Name: 'Sam Supplier' }, ToFull: [{ Email: address }], Subject: 'Re: Window order',
      TextBody: 'Six weeks from order.\n\nOn Mon, you wrote: ...', StrippedTextReply: 'Six weeks from order.', MessageID: `abc-${id}`, Headers: [], Attachments: [{}],
    },
  })
  expect(res.ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByText('Six weeks from order.')).toBeVisible()
  await expect(page.getByText('Sam Supplier')).toBeVisible()
  await page.goto('/notifications')
  await expect(page.getByText('Email from Sam Supplier')).toBeVisible()
})
