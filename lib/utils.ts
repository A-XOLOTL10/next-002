export { cn } from "cn"

// Events saved through form-data may store a list as one JSON string ('["a","b"]');
// accept that as well as a real array.
export const toList = (items: string[]): string[] => {
  if (items.length === 1 && items[0].trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(items[0])
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      // Not JSON after all; fall through and show it as-is.
    }
  }
  return items
}
