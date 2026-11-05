"use client"

import { useId, useState, type InputHTMLAttributes } from "react"

/**
 * A password field with a show/hide button. The button is type="button" so it never submits
 * the form, and it only switches the input's type, so password managers keep working.
 */
const PasswordInput = (props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) => {
  const [visible, setVisible] = useState(false)
  const id = useId()
  const inputId = props.id ?? id

  return (
    <div className="relative">
      <input {...props} id={inputId} type={visible ? "text" : "password"} className={`${props.className ?? "admin-input"} w-full pr-16`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-controls={inputId}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="text-light-200 hover:text-light-100 absolute inset-y-0 right-0 cursor-pointer px-3 text-xs font-semibold"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  )
}

export default PasswordInput
