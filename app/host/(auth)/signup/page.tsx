import Link from "next/link"
import { AuthShell, OAuthButtons } from "@/components/auth/AuthShell"
import { SignUpForm } from "@/components/auth/AuthForms"

// Host sign-up. Static: the form posts to signUpAction. After confirming their email (or with
// Google/GitHub straight away), new hosts see the welcome slides, then the verification form.
export default function SignUpPage() {
  return (
    <AuthShell
      title="Create a host account"
      intro="For companies and organizers of developer and corporate events. We verify every host before their events go live."
    >
      <OAuthButtons />
      <SignUpForm />
      <p className="text-light-200 text-center text-sm">
        Already have an account? <Link href="/host/login" className="text-primary underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
