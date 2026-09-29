import { redirect } from 'next/navigation'
import { getAppContext, hasAction } from '@/lib/context'

export default async function SettingsIndex() {
  const ctx = await getAppContext()
  redirect(ctx.workspace.mode === 'builder' && hasAction(ctx, 'settings.manage') ? '/settings/company' : '/settings/profile')
}
