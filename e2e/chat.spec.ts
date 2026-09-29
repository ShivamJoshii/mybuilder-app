import { test, expect } from '@playwright/test'
import { signUp, createBuilder, uid } from './helpers'

test('chat: builder and sub talk live in two browsers', async ({ page, browser }) => {
  const id = uid()
  await signUp(page, { first: 'Cara', last: 'Chat', email: `cara.${id}@chat.test` })
  await createBuilder(page, `Chat Homes ${id}`)
  await page.goto('/jobs/new')
  await page.getByLabel('Job name').fill(`Hemlock ${id}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page.getByRole('heading', { name: `Hemlock ${id}` })).toBeVisible()
  const jobUrl = page.url()
  await page.goto('/settings/subs')
  await page.getByRole('button', { name: 'Add sub or vendor' }).click()
  await page.getByLabel('Company name').fill(`Drywall Co ${id}`)
  await page.getByLabel('Email').fill(`dan.${id}@dry.test`)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText(`Drywall Co ${id} added`)).toBeVisible()
  await page.keyboard.press('Escape')
  const link = await page.locator('[data-copy*="/invite/"]').first().getAttribute('data-copy')
  await page.goto(jobUrl)
  await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/jobs/')), page.getByRole('button', { name: 'Add to job' }).click()])

  // Sub joins in a second browser
  const subCtx = await browser.newContext()
  const sub = await subCtx.newPage()
  await sub.goto(new URL(link!).pathname)
  await sub.getByRole('link', { name: 'Create account' }).click()
  await sub.getByLabel('First name').fill('Dan')
  await sub.getByLabel('Last name').fill('Drywall')
  await sub.getByLabel('Password').fill('correct-horse-battery')
  await sub.getByRole('button', { name: 'Create account' }).click()
  await sub.getByRole('button', { name: 'Accept invite' }).click()
  await expect(sub).toHaveURL(/\/summary/)

  // Builder starts a chat about the job
  await page.goto('/chat')
  await page.getByRole('button', { name: 'New chat' }).click()
  await page.getByLabel('Job').selectOption({ label: `Hemlock ${id}` })
  await page.getByLabel('Dan Drywall').check()
  await page.getByLabel('First message').fill('Can you start taping Monday?')
  await page.getByRole('button', { name: 'Start chat' }).click()
  await expect(page.getByTestId('chat-feed').getByText('Can you start taping Monday?')).toBeVisible()

  await sub.goto('/chat')
  await expect(sub.getByTestId('chat-feed').getByText('Can you start taping Monday?')).toBeVisible()
  await sub.getByLabel('Message').fill('Yes, 7am. Need the heat on.')
  await sub.keyboard.press('Enter')
  await expect(sub.getByTestId('chat-feed').getByText('Yes, 7am. Need the heat on.')).toBeVisible()

  // Builder sees the reply arrive without reloading
  await expect(page.getByTestId('chat-feed').getByText('Yes, 7am. Need the heat on.')).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: 'test-results/98-chat.png' })
  await subCtx.close()
})
