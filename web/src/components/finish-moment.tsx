"use client";
// Finishing a month: the three cards gather into a stack and slide into
// History, which nods as they land, and a line sums up what was confirmed.
// With reduced motion only the summary appears.
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const EASE = "cubic-bezier(.16, 1, .3, 1)";

export function FinishMoment({ summary }: { summary: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  // Tidy up only if the page goes away mid-flight; tidying the URL must not stop it.
  useEffect(() => () => { layerRef.current?.remove(); document.querySelector(".lanes")?.classList.remove("filing"); }, []);

  useEffect(() => {
    if (params.get("finished") !== "1") return;
    const next = new URLSearchParams(params);
    next.delete("finished");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    setMessage(summary);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".lane-slide > .expandable"));
    const lanes = document.querySelector<HTMLElement>(".lanes");
    const target = Array.from(document.querySelectorAll<HTMLElement>('a[href="/history"]')).find((a) => a.offsetParent !== null);
    if (!cards.length || !lanes || !target) return;

    // Copies of the cards in a layer of their own, starting where the cards are
    // (on a phone, the ones off to the side start from the visible one).
    const view = lanes.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "finish-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    layerRef.current = layer;
    const rects = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return r.left >= view.left - 1 && r.right <= view.right + 1 ? r : cards[0].getBoundingClientRect();
    });
    const lead = rects[0];
    const ghosts = cards.map((c, i) => {
      const g = c.cloneNode(true) as HTMLElement;
      g.className = "finish-ghost";
      Object.assign(g.style, { left: `${rects[i].left}px`, top: `${rects[i].top}px`, width: `${rects[i].width}px`, height: `${rects[i].height}px` });
      layer.append(g);
      return g;
    });
    lanes.classList.add("filing");

    const stackX = view.left + view.width / 2 - lead.width / 2, stackY = lead.top;
    const t = target.getBoundingClientRect();
    const tx = t.left + t.width / 2, ty = t.top + t.height / 2;
    const anims = ghosts.map((g, i) => {
      const r = rects[i];
      const sx = stackX - r.left + (i - 1) * 10, sy = stackY - r.top + (i - 1) * 8;
      const fx = tx - (r.left + r.width / 2), fy = ty - (r.top + r.height / 2);
      return g.animate([
        { transform: "none", opacity: 1 },
        { transform: `translate(${sx}px, ${sy}px) rotate(${(i - 1) * 3}deg)`, opacity: 1, offset: 0.42 },
        { transform: `translate(${sx}px, ${sy}px) rotate(${(i - 1) * 3}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${fx}px, ${fy}px) scale(.06)`, opacity: 0.2 },
      ], { duration: 1250, easing: EASE, delay: i * 40, fill: "forwards" });
    });
    Promise.all(anims.map((a) => a.finished)).then(() => {
      layer.remove();
      target.classList.add("received");
      window.setTimeout(() => target.classList.remove("received"), 600);
      lanes.classList.remove("filing");
    });
    // Runs once per arrival from the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (!message) return null;
  return <div className="toast finish-toast" role="status">{message}</div>;
}
