import { requireAdmin } from "@/lib/auth"

// Every console page: team accounts only. Hosts are sent to their own dashboard, so the console
// isn't confirmed to exist for them. (Pages also check again, with the stricter requireAdmin(),
// which sends admins without an authenticator app to the Security page first.)
export default async function ConsoleLayout({ children }: LayoutProps<"/host/console">) {
  await requireAdmin({ setupPage: true })
  return <>{children}</>
}
