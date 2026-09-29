'use client'
import { startTransition } from 'react'

/**
 * React 19 resets uncontrolled fields after a <form action> finishes — even when the server
 * returned a validation error, so people lose what they typed. Submitting through onSubmit
 * keeps their input; the clicked button's name/value (e.g. intent) is still sent.
 */
export function keepValues(formAction: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
    const fd = new FormData(e.currentTarget, submitter)
    startTransition(() => formAction(fd))
  }
}
