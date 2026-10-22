export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" aria-hidden="true" className={className}>
      <path d="M125.31 62.87 A50 50 0 1 1 92.94 35.70" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      <path d="M54 86 A26 26 0 0 1 72 61" fill="none" stroke="var(--mint)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="111" cy="33" r="6" fill="currentColor" />
      <circle cx="130" cy="43" r="4.5" fill="currentColor" />
      <circle cx="119" cy="14" r="4" fill="currentColor" />
      <circle cx="141" cy="25" r="3" fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <span className={`inline-flex items-center gap-2 font-display font-extrabold tracking-tight ${big ? "text-4xl" : "text-2xl"}`}>
      <LogoMark className={`text-accent ${big ? "size-11" : "size-8"}`} />
      estoura
    </span>
  );
}
