// Reading a recurring bill typed as one line: "Netflix 10.99 joint".
export type Owner = "Joint" | "Cal" | "Dani";

/** A name, then the monthly amount (a £ and commas are fine), then optionally
 *  whose it is. The owner defaults to Joint. Anything else gives null. */
export function parseQuickAdd(text: string): { name: string; amount: number; tag: Owner } | null {
  const m = text.trim().match(/^(.+?)\s+£?(\d[\d,]*(?:\.\d{1,2})?)(?:\s+(joint|cal|dani))?$/i);
  if (!m) return null;
  const amount = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const tag = (m[3] ? m[3][0].toUpperCase() + m[3].slice(1).toLowerCase() : "Joint") as Owner;
  return { name: m[1].trim(), amount, tag };
}
