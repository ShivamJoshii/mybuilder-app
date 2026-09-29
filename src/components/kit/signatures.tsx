import { formatDate } from '@/lib/utils'

type Sig = { id: string; decision: string; signer_name: string; on_behalf: boolean; signature: string | null; comment: string | null; signed_at: string }

/** Signature blocks for approved/declined documents. */
export function Signatures({ sigs }: { sigs: Sig[] }) {
  return (
    <>
      {sigs.map((s) => (
        <div key={s.id} className="mt-6 rounded-md border border-border p-4">
          <div className="text-xs text-text-3">{s.decision === 'approved' ? 'Approved' : 'Declined'} by {s.signer_name}{s.on_behalf ? ' (recorded by the builder)' : ''} on {formatDate(s.signed_at)}</div>
          {s.signature?.startsWith('typed:') && <div className="mt-2 font-serif text-3xl italic">{s.signature.slice(6)}</div>}
          {s.signature?.startsWith('data:image/png;base64,') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.signature} alt={`Signature of ${s.signer_name}`} className="mt-2 h-20" />
          )}
          {s.comment && <p className="mt-2 text-[13px]">{s.comment}</p>}
        </div>
      ))}
    </>
  )
}
