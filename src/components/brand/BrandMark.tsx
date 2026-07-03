// src/components/brand/BrandMark.tsx
export function BrandMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="8" y="26" width="8" height="14" rx="2.5" fill="#1b2430" />
      <rect x="20" y="20" width="8" height="20" rx="2.5" fill="#1b2430" />
      <rect x="32" y="26" width="8" height="14" rx="2.5" fill="#1b2430" />
      <path
        d="M6 21 L24 8 L42 21"
        stroke="#00A651"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
