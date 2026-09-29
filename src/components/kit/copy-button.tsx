'use client'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CopyButton({ value, label = 'Copy link' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button type="button" size="sm" data-copy={value} onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}>
      {done ? <Check /> : <Copy />}{done ? 'Copied' : label}
    </Button>
  )
}
