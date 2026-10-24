import { redirect } from "next/navigation";
import { hasSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await hasSession()) redirect("/");
  return (
    <main className="login">
      <div className="card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full.png" alt="Dani and Cal household budget logo" width={150} height={150} />
        <div>
          <h1 style={{ fontSize: 24 }}>Household Budget</h1>
          <p className="subtitle">Enter the shared password to continue</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
