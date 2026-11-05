import SessionLoader from "@/components/SessionLoader"

// Shown straight away when moving between console pages, while the next one loads its data.
export default function Loading() {
  return <SessionLoader label="Loading..." />
}
