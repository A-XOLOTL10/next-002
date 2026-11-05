import type { Metadata } from "next"

// Everything under /host: sign-in pages, the host dashboard and the admin console.
// Kept out of search results.
export const metadata: Metadata = {
  title: "Host | DevEvent",
  robots: { index: false, follow: false },
}

export default function HostLayout({ children }: LayoutProps<"/host">) {
  return <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-10">{children}</section>
}
