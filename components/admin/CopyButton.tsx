"use client"

import { useState } from "react"

/** Copies text to the clipboard, with a short confirmation. */
const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button type="button" onClick={handleCopy} className="admin-button w-fit text-sm">
      {copied ? "Copied!" : label}
    </button>
  )
}

export default CopyButton
