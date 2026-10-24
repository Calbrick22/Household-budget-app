"use client";
// Shown inside the app frame when a page fails, most often because the
// database can't be reached.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="card">
      <h1 style={{ fontSize: 22 }}>Couldn&apos;t load this page</h1>
      <p className="subtitle">The database may be waking up or unreachable. Try again in a moment.</p>
      {error.digest && <p className="small muted" style={{ marginTop: 8 }}>Reference: {error.digest}</p>}
      <button className="btn primary" type="button" onClick={reset} style={{ marginTop: 16 }}>Try again</button>
    </section>
  );
}
