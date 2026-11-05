"use client"

import { startTransition, type FormEvent } from "react"

/**
 * Submits a form to its useActionState action WITHOUT React's automatic form reset.
 *
 * With <form action={...}>, React 19 clears every field once the action finishes, including
 * when it failed. On the sign-in form that emptied the email box after one wrong password, so
 * the next "Sign in" press did nothing (the browser refused the empty required field) and people
 * had to type everything twice. Use as <form action={formAction} onSubmit={keepValues(formAction)}>:
 * with JavaScript the handler runs instead (fields stay as typed); without it the action still works.
 */
export const keepValues =
  (formAction: (formData: FormData) => void) =>
  (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    // Includes the pressed button's name/value, for forms with more than one submit button.
    const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
    startTransition(() => formAction(formData))
  }
