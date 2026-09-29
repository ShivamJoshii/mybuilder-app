import type { Metadata } from 'next'
import { getAppContext } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Alert } from '@/components/ui/alert'
import { NotificationMatrix } from './matrix'

export const metadata: Metadata = { title: 'Notification settings' }

export default async function NotificationSettingsPage() {
  const ctx = await getAppContext()
  const supabase = await createClient()
  const [{ data: types }, { data: prefs }] = await Promise.all([
    supabase.from('app_notification_types').select('*').order('sort'),
    supabase.from('notification_prefs').select('*').eq('user_id', ctx.userId),
  ])
  const pmap = new Map((prefs ?? []).map((p) => [p.type, p]))
  const rows = (types ?? []).map((t) => {
    const p = pmap.get(t.key)
    return { key: t.key, grp: t.grp, module: t.module, label: t.label,
      email: p?.email ?? t.default_email, text: p?.text ?? t.default_text, push: p?.push ?? t.default_push }
  })
  return (
    <>
      <PageHeader title="Notifications" />
      <div className="max-w-4xl space-y-4 p-5">
        <Alert tone="info">Email, text and push delivery switch on once the email and SMS services are connected. In-app notifications (the bell) work now.</Alert>
        <NotificationMatrix rows={rows} />
      </div>
    </>
  )
}
