/**
 * Static fallback. Shown:
 *  - instantly on first paint (it is the LCP element) while the 3D chunk loads
 *  - permanently for reduced-motion / low-power / no-WebGL visitors
 */
export default function Poster({ loading = false, reason = null, onLoad3D = null }) {
  return (
    <div className="poster">
      <img
        src="/poster.webp"
        alt="A white and orange toy robot rendered in 3D"
        width="1200"
        height="900"
        fetchpriority="high"
        decoding="async"
      />
      <div className="poster-overlay">
        {loading && (
          <p className="pill" role="status">
            <span className="spinner" aria-hidden="true" /> Loading 3D…
          </p>
        )}
        {reason && <p className="pill">{reason}</p>}
        {onLoad3D && (
          <button className="btn" onClick={onLoad3D}>
            Load interactive 3D anyway
          </button>
        )}
      </div>
    </div>
  );
}
