"use client";
// Small SVG charts drawn at the width they are given, so text stays at its real
// size on a phone. Rules from the tasteskill app chapter: 3-5 quiet gridlines,
// round ticks above the largest value, 2px straight lines without markers,
// square bars, a legend only when there are two series or more.
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Round ticks (1, 2, 2.5 or 5 x 10^n) whose top sits above the largest value. */
function ticks(max: number, count = 4): number[] {
  if (max <= 0) max = 1;
  const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  let hi = Math.ceil(max / step) * step;
  if (hi <= max) hi += step;
  const out: number[] = [];
  for (let v = 0; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}

const PAD = { top: 10, right: 8, bottom: 26, left: 48 };

export interface Series { name: string; values: number[]; color: string }

export function LineChart({ labels, series, suffix = "", height = 220, annotations = [] }: {
  labels: string[]; series: Series[]; suffix?: string; height?: number; annotations?: { at: number; label: string }[];
}) {
  const [ref, w] = useWidth();
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ys = ticks(max);
  const top = ys[ys.length - 1];
  const innerW = Math.max(0, w - PAD.left - PAD.right), innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  return (
    <div ref={ref}>
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.name}><i className="line" style={{ background: s.color }} />{s.name}</span>)}</div>}
      {w > 0 && (
        <svg className="chart" width={w} height={height} role="img" aria-label={series.map((s) => `${s.name}: ${s.values.map((v, i) => `${labels[i]} ${v.toFixed(1)}${suffix}`).join(", ")}`).join(". ")}>
          {ys.map((t) => <g key={t}><line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--neutral-light)" : "var(--grid)"} /><text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{t}{suffix}</text></g>)}
          {labels.map((l, i) => <text key={l + i} x={x(i)} y={height - 6} textAnchor={i === 0 && labels.length > 1 ? "start" : i === labels.length - 1 && labels.length > 1 ? "end" : "middle"}>{l}</text>)}
          {series.map((s) => (
            <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={s === series[0] ? 2.5 : 2} strokeLinejoin="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
          ))}
          {series[0].values.length === 1 && <circle cx={x(0)} cy={y(series[0].values[0])} r={4} fill={series[0].color} />}
          {annotations.map((a) => (
            <g key={a.at}>
              <line x1={x(a.at)} x2={x(a.at)} y1={y(0) - 4} y2={PAD.top + 14} stroke="var(--negative)" />
              <text x={x(a.at)} y={PAD.top + 8} textAnchor="middle" style={{ fill: "var(--negative)" }}>{a.label}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

export function StackedBars({ labels, series, percent = false, height = 220, pounds = false }: {
  labels: string[]; series: Series[]; percent?: boolean; height?: number; pounds?: boolean;
}) {
  const [ref, w] = useWidth();
  const totals = labels.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const ys = percent ? [0, 25, 50, 75, 100] : ticks(Math.max(0, ...totals));
  const top = ys[ys.length - 1];
  const innerW = Math.max(0, w - PAD.left - PAD.right), innerH = height - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, labels.length);
  const bw = Math.min(56, slot * 0.5);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const tick = (t: number) => (percent ? `${t}%` : pounds ? `£${t.toLocaleString("en-GB")}` : String(t));
  return (
    <div ref={ref}>
      <div className="legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
      {w > 0 && (
        <svg className="chart" width={w} height={height} role="img"
          aria-label={labels.map((l, i) => `${l}: ${series.map((s) => `${s.name} ${percent && totals[i] ? Math.round(s.values[i] / totals[i] * 100) + "%" : money(s.values[i])}`).join(", ")}`).join(". ")}>
          {ys.map((t) => <g key={t}><line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--neutral-light)" : "var(--grid)"} /><text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{tick(t)}</text></g>)}
          {labels.map((l, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            let acc = 0;
            return (
              <g key={l + i}>
                {series.map((s) => {
                  const v = percent ? (totals[i] ? (s.values[i] / totals[i]) * 100 : 0) : s.values[i];
                  const y0 = y(acc), y1 = y(acc + v);
                  acc += v;
                  return v > 0 ? <rect key={s.name} x={cx - bw / 2} width={bw} y={y1} height={Math.max(0, y0 - y1 - (acc < top ? 2 : 0))} fill={s.color} /> : null;
                })}
                <text x={cx} y={height - 6} textAnchor="middle">{l}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export interface FlowData {
  cal: number; dani: number;
  outs: { name: string; value: number; color: string; soft: string }[];
  jointSplit: { name: string; value: number; color: string }[];
  joint: { value: number; color: string; soft: string };
}

/** Where a month's income goes: two incomes join, then split, and joint
 *  savings splits again into its pots. Labels carry the amounts, so nothing
 *  needs a hover. On narrow screens it becomes one labelled bar per stage. */
export function MoneyFlow(d: FlowData) {
  const [ref, w] = useWidth();
  const narrow = w > 0 && w < 600;
  const income = d.cal + d.dani;
  const outs = [...d.outs, { name: "Joint savings", value: d.joint.value, color: d.joint.color, soft: d.joint.soft }].filter((o) => o.value > 0);
  const outTotal = outs.reduce((s, o) => s + o.value, 0);
  if (narrow) {
    const bar = (parts: { name: string; value: number; color: string }[], total: number) => (
      <>
        <div className="track" style={{ height: 14, margin: "6px 0 10px" }}>{parts.filter((p) => p.value > 0).map((p) => <span key={p.name} style={{ width: `${(p.value / total) * 100}%`, background: p.color, borderRight: "2px solid #fff" }} />)}</div>
        {parts.map((p) => <div key={p.name} className="row" style={{ padding: "6px 0" }}><span><span className="dot" style={{ background: p.color }} />{p.name}</span><span className="amt">{money(p.value)}</span></div>)}
      </>
    );
    return (
      <div ref={ref}>
        <p className="step-title" style={{ marginTop: 8 }}>Comes in</p>
        {bar([{ name: "Cal income", value: d.cal, color: "var(--cal-mid)" }, { name: "Dani income", value: d.dani, color: "var(--dani-mid)" }], income)}
        <p className="step-title" style={{ marginTop: 16 }}>Goes to</p>
        {bar(outs, Math.max(outTotal, income))}
        {d.joint.value > 0 && <><p className="step-title" style={{ marginTop: 16 }}>Joint savings goes to</p>{bar(d.jointSplit, d.joint.value)}</>}
      </div>
    );
  }
  const H = 340, nodeW = 10, gap = 14, labelW = 190;
  const scale = (H - gap * Math.max(outs.length - 1, 1)) / Math.max(income, outTotal, 1);
  const x0 = labelW, x1 = Math.max(x0 + 120, (w - labelW) * 0.42), x3 = w - labelW - nodeW, x2 = x1 + (x3 - x1) * 0.55;
  // left: the two incomes; middle: the total; right: where it goes
  const left = [{ name: "Cal income", value: d.cal, color: "var(--cal-mid)", soft: "var(--cal-soft)" }, { name: "Dani income", value: d.dani, color: "var(--dani-mid)", soft: "var(--dani-soft)" }];
  let ly = 0;
  const leftNodes = left.map((n) => { const y = ly; ly += n.value * scale + gap; return { ...n, y, h: n.value * scale }; });
  const midH = Math.max(income, outTotal) * scale;
  const midY = (H - midH) / 2;
  let ry = 0;
  const rightNodes = outs.map((n) => { const y = ry; ry += n.value * scale + gap; return { ...n, y, h: n.value * scale }; });
  const band = (xa: number, ya: number, xb: number, yb: number, h: number, fill: string, key: string) => {
    const mx = (xa + xb) / 2;
    return <path key={key} d={`M${xa},${ya} C${mx},${ya} ${mx},${yb} ${xb},${yb} L${xb},${yb + h} C${mx},${yb + h} ${mx},${ya + h} ${xa},${ya + h} Z`} fill={fill} />;
  };
  let inAcc = midY, outAcc = midY;
  const jsNode = rightNodes.find((n) => n.name === "Joint savings");
  return (
    <div ref={ref}>
      {w > 0 && (
        <svg className="chart" width={w} height={H + 4} role="img"
          aria-label={`Cal income ${money(d.cal)} and Dani income ${money(d.dani)} go to ${outs.map((o) => `${o.name} ${money(o.value)}`).join(", ")}`}>
          {leftNodes.map((n) => { const b = band(x0 + nodeW, n.y, x1, inAcc, n.h, n.soft, n.name); inAcc += n.h; return b; })}
          {rightNodes.map((n) => {
            const target = n.name === "Joint savings" ? x2 : x3;
            const b = band(x1 + nodeW, outAcc, target, n.y, n.h, n.soft, n.name); outAcc += n.h; return b;
          })}
          {jsNode && (() => {
            let acc = jsNode.y;
            const parts = d.jointSplit.filter((p) => p.value > 0);
            let ty = jsNode.y;
            return parts.map((p) => {
              const h = p.value * scale;
              const b = band(x2 + nodeW, acc, x3, ty, h, "var(--joint-soft)", `js-${p.name}`);
              const node = <g key={`jsn-${p.name}`}><rect x={x3} y={ty} width={nodeW} height={Math.max(h, 1)} fill={p.color} /><text className="label" x={x3 + nodeW + 8} y={ty + Math.max(h, 1) / 2 + 4}>{p.name} {money(p.value)}</text></g>;
              acc += h; ty += h + 6;
              return <g key={p.name}>{b}{node}</g>;
            });
          })()}
          {leftNodes.map((n) => <g key={n.name}><rect x={x0} y={n.y} width={nodeW} height={n.h} fill={n.color} /><text className="label" x={x0 - 8} y={n.y + n.h / 2 + 4} textAnchor="end">{n.name} {money(n.value)}</text></g>)}
          <rect x={x1} y={midY} width={nodeW} height={midH} fill="var(--neutral-dark)" />
          <text className="label" x={x1 + nodeW + 6} y={midY - 6}>Total income {money(income)}</text>
          {rightNodes.map((n) => n.name === "Joint savings"
            ? <g key={n.name}><rect x={x2} y={n.y} width={nodeW} height={n.h} fill={n.color} /><text className="label" x={x2 - 6} y={n.y - 6} textAnchor="middle">{n.name} {money(n.value)}</text></g>
            : <g key={n.name}><rect x={x3} y={n.y} width={nodeW} height={n.h} fill={n.color} /><text className="label" x={x3 + nodeW + 8} y={n.y + n.h / 2 + 4}>{n.name} {money(n.value)}</text></g>)}
        </svg>
      )}
    </div>
  );
}
