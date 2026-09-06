/**
 * Product mark: a puck seen at a slight angle inside a dark disc. Drawn in
 * SVG so the app carries no image dependency — restrained on purpose, this
 * is a UX implementation rather than a finished brand identity.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Draft assistant">
      <circle cx="16" cy="16" r="16" fill="#17191C" />
      <ellipse cx="16" cy="19" rx="9.5" ry="4.2" fill="#5F6670" />
      <ellipse cx="16" cy="16.4" rx="9.5" ry="4.2" fill="#F3F4F6" />
      <ellipse cx="16" cy="16.4" rx="4.6" ry="2" fill="#B5BAC1" />
    </svg>
  );
}
