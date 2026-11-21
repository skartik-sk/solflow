/**
 * SolStudio's logo, copied from apps/web (components/ui-kit/dashboard-mark.tsx).
 * The landing draws it with its own --accent; inside the app --accent is a gray
 * surface, so this copy fills with --primary (the same brand cyan).
 */
export function SolMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="15" fill="var(--primary)" />
      <rect x="15" y="15" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
      <path d="M23.5 32v9a5 5 0 0 0 5 5H33" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <rect x="33" y="33" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
    </svg>
  );
}
