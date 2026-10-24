import Link from "next/link";

export default function NotFound() {
  return (
    <main className="login">
      <div className="card">
        <h1 style={{ fontSize: 24 }}>That page doesn&apos;t exist</h1>
        <p className="subtitle">The month may have been deleted.</p>
        <Link className="btn primary" href="/">Go to this month</Link>
      </div>
    </main>
  );
}
