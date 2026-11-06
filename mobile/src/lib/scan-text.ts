// What a scanned QR code (or typed text) is.

export type Scanned =
  | { type: "setup"; kind: "admin" | "staff"; code: string }
  | { type: "ticket"; code: string }
  | { type: "unknown" }

const TICKET = /^DEV-[A-Z0-9]{10}$/

export function classify(raw: string): Scanned {
  const text = raw.trim()
  if (text.startsWith("DEVEVENT-LINK:")) return { type: "setup", kind: "admin", code: text }
  if (text.startsWith("DEVEVENT-STAFF:")) return { type: "setup", kind: "staff", code: text }
  // Ticket QR codes hold a link like https://site/t/DEV-XXXXXXXXXX; older ones ?ticket=DEV-...
  const id = (text.match(/\/t\/([\w%-]+)/)?.[1] ?? text.match(/ticket=([\w%-]+)/)?.[1] ?? text).toUpperCase()
  return TICKET.test(id) ? { type: "ticket", code: id } : { type: "unknown" }
}

/** Typed ticket IDs: forgiving about case, spaces and a missing "DEV-". */
export function normalizeTyped(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const body = compact.startsWith("DEV") ? compact.slice(3) : compact
  return `DEV-${body}`
}
