"use client";
// Delete asks first, in a dialog that names the month.
import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { deleteMonth } from "@/app/actions";

function Confirm() {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending} style={{ background: "var(--negative)", borderColor: "var(--negative)" }}>{pending ? "Deleting…" : "Yes, delete"}</button>;
}

export function DeleteMonth({ id, label }: { id: number; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="btn danger" type="button" onClick={() => ref.current?.showModal()} aria-label={`Delete ${label}`}>Delete</button>
      <dialog ref={ref} className="dialog" aria-labelledby={`del-${id}`}>
        <form action={deleteMonth} className="stack" style={{ gap: 16 }}>
          <input type="hidden" name="id" value={id} />
          <h2 id={`del-${id}`}>Permanently delete {label}?</h2>
          <p className="muted">Its bills and income go too. This can&apos;t be undone.</p>
          <div className="inline" style={{ justifyContent: "flex-end" }}>
            <button className="btn" type="button" onClick={() => ref.current?.close()}>Cancel</button>
            <Confirm />
          </div>
        </form>
      </dialog>
    </>
  );
}
