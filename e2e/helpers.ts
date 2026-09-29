import { expect, type Page } from '@playwright/test'

export const uid = () => Math.random().toString(36).slice(2, 8)

export async function signUp(page: Page, opts: { first: string; last: string; email: string; password?: string; next?: string }) {
  await page.goto(opts.next ? `/signup?next=${encodeURIComponent(opts.next)}` : '/signup')
  await page.getByLabel('First name').fill(opts.first)
  await page.getByLabel('Last name').fill(opts.last)
  await page.getByLabel('Work email').fill(opts.email)
  await page.getByLabel('Password').fill(opts.password ?? 'correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
}

export async function signIn(page: Page, email: string, password = 'correct-horse-battery') {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
}

export async function createBuilder(page: Page, company: string) {
  await expect(page).toHaveURL(/\/onboarding/)
  await page.getByLabel('Company name').fill(company)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/summary/)
}
