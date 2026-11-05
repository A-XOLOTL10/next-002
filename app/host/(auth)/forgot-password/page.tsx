import Link from "next/link"
import { AuthShell } from "@/components/auth/AuthShell"
import { ForgotPasswordForm } from "@/components/auth/AuthForms"

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" intro="Enter your account's email and we'll send you a link to choose a new password.">
      <ForgotPasswordForm />
      <Link href="/host/login" className="text-light-200 text-center text-sm hover:underline">Back to sign in</Link>
    </AuthShell>
  )
}
