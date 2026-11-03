"use client"

import { useState, useTransition } from "react"
import { deleteEventAction } from "@/lib/actions/admin.actions"

const DeleteEventButton = ({ slug, title }: { slug: string; title: string }) => {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    // Deleting removes every booking too and can't be undone, so confirm first.
    if (!window.confirm(`Delete "${title}" and all of its bookings? This can't be undone.`)) return

    setError(null)
    startTransition(async () => {
      // On success the action redirects to /admin; it only returns on failure.
      const result = await deleteEventAction(slug)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="cursor-pointer text-sm text-red-400 hover:underline disabled:opacity-60"
      >
        {pending ? "Deleting..." : "Delete"}
      </button>
      {error && <span className="text-xs text-red-400" role="alert">{error}</span>}
    </span>
  )
}

export default DeleteEventButton
