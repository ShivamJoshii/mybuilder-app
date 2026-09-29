/** Company block at the top of printable documents (proposals, invoices, change orders, POs). */
export type DocOrg = { id: string; name: string; street: string | null; city: string | null; province: string | null; postal_code: string | null; phone: string | null; email: string | null; logo_url: string | null; gst_number: string | null; qst_number?: string | null; updated_at?: string; legal_name?: string | null; website?: string | null }

export const DOC_ORG_COLUMNS = 'id,name,legal_name,website,street,city,province,postal_code,phone,email,logo_url,gst_number,qst_number,updated_at'

export function DocHeader({ org, showTax = false }: { org: DocOrg | null; showTax?: boolean }) {
  if (!org) return null
  return (
    <div className="flex items-start gap-4">
      {org.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/branding/${org.id}/logo?v=${encodeURIComponent(org.updated_at ?? '')}`} alt={`${org.name} logo`} className="max-h-16 max-w-40 object-contain" />
      )}
      <div>
        <div className="text-lg font-semibold">{org.name}</div>
        {org.legal_name && org.legal_name !== org.name && <div className="text-[13px] text-text-3">{org.legal_name}</div>}
        <div className="text-[13px] text-text-3">{[org.street, org.city, org.province, org.postal_code].filter(Boolean).join(', ')}</div>
        <div className="text-[13px] text-text-3">{[org.phone, org.email, org.website?.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')}</div>
        {showTax && (org.gst_number || org.qst_number) && <div className="text-[13px] text-text-3">{[org.gst_number && `GST/HST ${org.gst_number}`, org.qst_number && `QST ${org.qst_number}`].filter(Boolean).join(' · ')}</div>}
      </div>
    </div>
  )
}
