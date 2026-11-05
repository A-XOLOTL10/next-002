import SessionLoader from "@/components/SessionLoader"

// Shown straight away when moving between protected pages, while the next page checks access.
export default function Loading() {
  return <SessionLoader label="Loading..." />
}
