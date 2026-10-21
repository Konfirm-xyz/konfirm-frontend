"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

// Password input with a show/hide toggle so people can verify what they
// typed before submitting — plain <input type="password"> gives no way to
// check for typos, which is especially painful on mobile keyboards.
export default function PasswordInput({ id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="password-input">
      <input id={inputId} type={visible ? "text" : "password"} {...props} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
