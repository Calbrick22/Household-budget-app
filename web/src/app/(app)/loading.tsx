// While a page loads: the frame and grey blocks at the size of what will come.
export default function Loading() {
  const block = (h: number, w = "100%") => <div style={{ height: h, width: w, background: "var(--rule)", borderRadius: 8 }} />;
  return (
    <div aria-busy="true" aria-label="Loading">
      {block(34, "280px")}
      <div className="lanes section-gap">
        {[0, 1, 2].map((i) => <div key={i} className="lane-slide"><section className="card stack" style={{ gap: 14 }}>{block(32, "60%")}{block(38, "50%")}{block(16)}{block(16)}{block(16)}</section></div>)}
      </div>
    </div>
  );
}
