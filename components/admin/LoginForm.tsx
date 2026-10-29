"use client"

import { useActionState } from "react"
import { login, type LoginState } from "@/lib/actions/admin.actions"

const LoginForm = () => {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null)

  return (
    <form action={formAction} className="bg-dark-100 border-dark-200 flex w-full max-w-sm flex-col gap-5 rounded-[10px] border px-5 py-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="admin-email">Email</label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="bg-dark-200 rounded-[6px] px-5 py-2.5"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="bg-dark-200 rounded-[6px] px-5 py-2.5"
        />
      </div>

      {state?.error && <p className="text-sm text-red-400" role="alert">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary hover:bg-primary/90 cursor-pointer rounded-[6px] px-4 py-2.5 font-semibold text-black disabled:opacity-60"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  )
}

export default LoginForm
