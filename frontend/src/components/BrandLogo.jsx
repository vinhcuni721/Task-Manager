function BrandIcon({ small = false }) {
  const wrapperSize = small ? "h-10 w-10" : "h-12 w-12";
  const svgSize = small ? "h-5 w-5" : "h-6 w-6";

  return (
    <span
      className={`relative inline-flex ${wrapperSize} items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-[linear-gradient(135deg,#4f46e5_0%,#0ea5e9_100%)] text-white shadow-lg`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className={svgSize} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8h7l2 3h7" />
        <path d="M4 16h7l2-3h7" />
      </svg>
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.35),transparent_45%)]" />
    </span>
  );
}

function BrandLogo({
  compact = false,
  inverse = false,
  subtitle = "Productivity Workspace",
  className = "",
}) {
  const titleClass = inverse ? "text-white" : "text-slate-900";
  const subtitleClass = inverse ? "text-slate-300" : "text-slate-500";

  if (compact) {
    return (
      <span className={className}>
        <BrandIcon small />
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <BrandIcon />
      <div className="min-w-0">
        <p className={`truncate text-[1.35rem] font-extrabold leading-5 tracking-tight ${titleClass}`}>TaskFlow</p>
        <p className={`truncate text-xs font-medium ${subtitleClass}`}>{subtitle}</p>
      </div>
    </div>
  );
}

export default BrandLogo;
