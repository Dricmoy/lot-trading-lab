// This deployment runs the pre-migration Django + Go backend on its own database branch.
const primary =
  import.meta.env.VITE_PRIMARY_URL || "https://lot-trading-lab.vercel.app";

export default function LegacyBanner() {
  return (
    <div className="legacy-banner" role="note">
      <span>
        <strong>Legacy backend:</strong> Django + Go (pre-migration), separate
        database.
      </span>
      <a href={primary}>Switch to Java/C++ →</a>
    </div>
  );
}
