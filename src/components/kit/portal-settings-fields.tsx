import { Field, Input, Select } from '@/components/ui/input'
import { PORTAL_TOGGLES } from '@/lib/portal-settings'

export function PortalSettingsFields({ s, idPrefix = '' }: { s: Record<string, unknown>; idPrefix?: string }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Schedule" htmlFor={`${idPrefix}schedule`}>
          <Select id={`${idPrefix}schedule`} name="schedule" defaultValue={String(s.schedule ?? 'phases')}>
            <option value="none">Hidden</option><option value="phases">Phases only</option><option value="all">All schedule items</option>
          </Select>
        </Field>
        <Field label="Show schedule this many days ahead" htmlFor={`${idPrefix}schedule_days_ahead`}>
          <Input id={`${idPrefix}schedule_days_ahead`} name="schedule_days_ahead" type="number" min={0} max={365} defaultValue={Number(s.schedule_days_ahead ?? 30)} />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PORTAL_TOGGLES.map(([name, label]) => (
          <label key={name} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name={name} defaultChecked={Boolean(s[name])} className="accent-brand" />{label}</label>
        ))}
      </div>
    </>
  )
}
