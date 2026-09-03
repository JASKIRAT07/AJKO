// App-wide consistent loading indicator: a spinner (circle) + text.
// Used everywhere content loads so the loading experience is uniform.
export default function Loader({ text = 'Loading…', full = true }) {
  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div className="spinner" />
      <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{text}</div>
    </div>
  );
  if (!full) return <div style={{ padding: '40px 0', display: 'grid', placeItems: 'center' }}>{inner}</div>;
  return <div className="full-center">{inner}</div>;
}
