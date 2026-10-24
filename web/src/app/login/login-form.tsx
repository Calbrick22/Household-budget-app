"use client";
import { useActionState, useState } from "react";
import { login } from "../actions";
import { IconEye, IconEyeOff } from "@/components/icons";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      {/* A fixed username, so password managers know which saved password this is. */}
      <input type="text" name="username" autoComplete="username" value="household" readOnly hidden />
      <label className="sr-only" htmlFor="password">Password</label>
      <div className="password">
        <input id="password" name="password" type={show ? "text" : "password"} className="input" placeholder="Password"
          autoComplete="current-password" autoCapitalize="none" spellCheck={false} autoFocus required />
        <button type="button" className="btn icon ghost" onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
      <button className="btn primary" type="submit" disabled={pending}>{pending ? "Unlocking…" : "Unlock"}</button>{/* taste-skill-ignore: the action itself, not a slogan */}
      {state?.error && <p className="alert bad" role="alert">{state.error}</p>}
    </form>
  );
}
