"use client";
import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <label className="sr-only" htmlFor="password" style={{ position: "absolute", left: -9999 }}>Password</label>
      <input id="password" name="password" type="password" className="input" placeholder="Password" autoComplete="current-password" autoFocus required />
      <button className="btn primary" type="submit" disabled={pending}>{pending ? "Unlocking…" : "Unlock"}</button>{/* taste-skill-ignore: the action itself, not a slogan */}
      {state?.error && <p className="alert bad" role="alert">{state.error}</p>}
    </form>
  );
}
