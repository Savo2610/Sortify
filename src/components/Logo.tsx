export function Logo({ size = 32, withText = false }: { size?: number; withText?: boolean }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9b87ff" />
            <stop offset="1" stopColor="#5b3df5" />
          </linearGradient>
          <linearGradient id="lg-b" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4ff0b8" />
            <stop offset="1" stopColor="#2bd4e8" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill="url(#lg-a)" />
        <rect x="14" y="17" width="36" height="6" rx="3" fill="#fff" opacity=".95" />
        <rect x="14" y="29" width="26" height="6" rx="3" fill="#fff" opacity=".7" />
        <rect x="14" y="41" width="16" height="6" rx="3" fill="#fff" opacity=".45" />
        <circle cx="45" cy="44" r="7" fill="url(#lg-b)" />
      </svg>
      {withText && <span className="logo__text">Sortify</span>}
    </span>
  );
}
