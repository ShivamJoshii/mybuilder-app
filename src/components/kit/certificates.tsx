import { FileText, ShieldCheck, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionForm } from './action-form'
import { ConfirmSubmit } from './confirm-submit'
import { CertUpload } from './cert-upload'
import { formatCAD, formatDate, todayIn } from '@/lib/utils'
import { CERT_KINDS, COMPLIANCE_STATUS, certState, type CertKind } from '@/lib/compliance'
import { addCertificate, deleteCertificate } from '@/app/(app)/settings/compliance-actions'

/** Certificates a sub keeps on file with one builder, plus the overall compliance status. */
export async function Certificates({ builderId, subId, uploaderOrgId, canEdit, path, title, tz }: {
  builderId: string; subId: string; uploaderOrgId: string; canEdit: boolean; path: string; title?: string; tz: string
}) {
  const supabase = await createClient()
  const [{ data: certs }, { data: status }, folder] = await Promise.all([
    supabase.from('sub_certificates').select('*, files(id,name)').eq('builder_org_id', builderId).eq('sub_org_id', subId).order('kind').order('expires_on', { ascending: false }),
    supabase.rpc('sub_compliance', { p_builder: builderId, p_sub: subId }),
    canEdit ? supabase.rpc('compliance_folder', { p_org: uploaderOrgId }).then((r) => r.data) : Promise.resolve(null),
  ])
  const st = COMPLIANCE_STATUS[status?.[0]?.status ?? 'ok']
  const detail = status?.[0]?.detail
  const today = todayIn(tz)
  const tone = { ok: 'success', expiring: 'warning', expired: 'danger' } as const

  return (
    <Card>
      <CardHeader title={title ?? 'Compliance'} actions={<Badge tone={st.tone}>{st.label}</Badge>}
        description="WCB clearance letters, insurance certificates and licences. Expiry dates drive reminders and the payment rule." />
      {detail && <div className="px-4 pt-3"><Alert tone={st.tone === 'warning' ? 'info' : 'danger'}>{detail}</Alert></div>}
      {(certs ?? []).length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No certificates on file" body={canEdit ? 'Add the WCB clearance letter and insurance certificate below.' : 'Nothing has been added yet.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-surface-2 text-left text-xs text-text-3">
              <tr><th className="px-3 py-2">Certificate</th><th className="px-3 py-2">Number / provider</th><th className="px-3 py-2">Coverage</th><th className="px-3 py-2">Expires</th><th className="px-3 py-2">Document</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(certs ?? []).map((c) => {
                const s = certState(c.expires_on, today)
                const file = c.files as { id: string; name: string } | null
                return (
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-medium">{CERT_KINDS[c.kind as CertKind]}{c.label ? <div className="text-xs font-normal text-text-3">{c.label}</div> : null}</td>
                    <td className="px-3 py-2">{c.number}{c.provider ? <div className="text-xs text-text-3">{c.provider}</div> : null}</td>
                    <td className="px-3 py-2 tabular-nums">{c.coverage != null ? formatCAD(Number(c.coverage)) : ''}</td>
                    <td className="px-3 py-2">{c.expires_on ? <Badge tone={tone[s]}>{s === 'expired' ? 'Expired ' : ''}{formatDate(c.expires_on)}</Badge> : <span className="text-text-3">No expiry</span>}</td>
                    <td className="px-3 py-2">
                      {file ? <a href={`/files/${file.id}/download?inline=1`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand hover:underline"><FileText className="size-4" />{file.name}</a>
                        : canEdit && folder ? <CertUpload folderId={folder} certId={c.id} path={path} /> : <span className="text-text-3">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canEdit && <form action={deleteCertificate.bind(null, c.id, path)}><ConfirmSubmit size="icon" variant="ghost" aria-label={`Delete ${CERT_KINDS[c.kind as CertKind]}`} title="Delete this certificate?" body="The record is removed; the document stays in the compliance folder."><Trash2 /></ConfirmSubmit></form>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <ActionForm action={addCertificate.bind(null, builderId, subId, path)} className="grid gap-3 border-t border-border p-4 sm:grid-cols-3">
          <Field label="Certificate" htmlFor={`k-${subId}`}><Select id={`k-${subId}`} name="kind" defaultValue="wcb_clearance">{Object.entries(CERT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Number" htmlFor={`n-${subId}`}><Input id={`n-${subId}`} name="number" maxLength={120} placeholder="Account or policy #" /></Field>
          <Field label="Provider" htmlFor={`p-${subId}`}><Input id={`p-${subId}`} name="provider" maxLength={200} placeholder="WCB Alberta, insurer…" /></Field>
          <Field label="Effective" htmlFor={`e-${subId}`}><Input id={`e-${subId}`} name="effective_on" type="date" /></Field>
          <Field label="Expires" htmlFor={`x-${subId}`}><Input id={`x-${subId}`} name="expires_on" type="date" /></Field>
          <Field label="Coverage (insurance)" htmlFor={`c-${subId}`}><Input id={`c-${subId}`} name="coverage" inputMode="decimal" placeholder="$2,000,000" /></Field>
          <Field label="Label" htmlFor={`l-${subId}`} className="sm:col-span-1"><Input id={`l-${subId}`} name="label" maxLength={120} placeholder="Optional" /></Field>
          <Field label="Notes" htmlFor={`o-${subId}`} className="sm:col-span-2"><Textarea id={`o-${subId}`} name="notes" rows={1} maxLength={2000} /></Field>
          <div className="sm:col-span-3"><Button type="submit" variant="primary">Add certificate</Button></div>
        </ActionForm>
      )}
    </Card>
  )
}
