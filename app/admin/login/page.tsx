import LoginForm from "@/components/admin/LoginForm"
import { continueAsVisitor } from "@/lib/actions/visitor.actions"

// The app's entry page: proxy.ts sends first-time visitors to "/" here.
// Static: reads no session, so it renders instantly.
export default function AdminLoginPage() {
  return (
    <div className="flex flex-col items-center gap-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-bold">Welcome to DevEvent</h1>
        <p className="text-light-100">Browse and book developer events, or sign in to manage them.</p>
      </div>

      <form action={continueAsVisitor} className="w-full max-w-sm">
        <button
          type="submit"
          className="bg-primary hover:bg-primary/90 w-full cursor-pointer rounded-[6px] px-4 py-3 text-lg font-semibold text-black"
        >
          Continue as visitor
        </button>
      </form>

      <div className="flex w-full max-w-sm items-center gap-3 text-sm text-light-200">
        <span className="bg-dark-200 h-px flex-1" />
        Admin sign in
        <span className="bg-dark-200 h-px flex-1" />
      </div>

      <LoginForm />
    </div>
  )
}
