import type { Metadata } from "next"

// Keep admin pages out of search results.
export const metadata: Metadata = {
  title: "Admin | DevEvents",
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-10">{children}</section>
}
