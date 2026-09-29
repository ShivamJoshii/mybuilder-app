import { Building2 } from 'lucide-react'

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-[17px] font-semibold">
        <span className="flex size-8 items-center justify-center rounded-md bg-nav text-white">
          <Building2 className="size-4" />
        </span>
        MyBuilder
      </div>
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">{children}</div>
    </div>
  )
}
