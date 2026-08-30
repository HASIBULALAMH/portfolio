'use client'

import {
  brandGlowStyle,
  getBrandColor,
  getDisplayBrandColor,
  getIconPath,
  iconSvgUrl,
} from '@/lib/tech-icons'

/**
 * Renders one Simple Icons brand mark from its slug.
 *
 * Two rendering paths, because path data for the full catalogue is far too
 * large to bundle:
 *   - preloaded slugs render as inline <svg>, so they can be recoloured with
 *     `currentColor` and need no network request;
 *   - everything else renders from public/tech-icons/<slug>.svg.
 *
 * Returns null for an unknown or empty slug so callers can use the standard
 * `<TechIcon .../> ?? fallback` shape without a wrapper check.
 *
 * `tone` picks which colour the mark is painted in:
 *   - 'brand'   the exact official colour (default; unchanged behaviour)
 *   - 'display' the official colour lightened only when it is too dark to read
 *               on the dark theme — what the tinted tiles use
 *   - 'current' inherit the surrounding text colour
 */
export function TechIcon({
  slug,
  title,
  className = 'h-5 w-5',
  colored = true,
  tone = colored ? 'brand' : 'current',
}) {
  if (!slug) return null

  const path = getIconPath(slug)
  const label = title || slug

  const fill =
    tone === 'current'
      ? 'currentColor'
      : (tone === 'display' ? getDisplayBrandColor(slug) : getBrandColor(slug)) ?? 'currentColor'

  if (!path) {
    // The packaged SVGs carry no fill attribute, so they paint black — which
    // disappears on a dark tile. Masking the file instead of drawing it lets
    // the same asset take any colour: the SVG supplies the shape, background
    // supplies the paint.
    return (
      <span
        role="img"
        aria-label={label}
        className={className}
        style={{
          backgroundColor: fill === 'currentColor' ? 'currentColor' : fill,
          maskImage: `url(${iconSvgUrl(slug)})`,
          WebkitMaskImage: `url(${iconSvgUrl(slug)})`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          display: 'inline-block',
        }}
      />
    )
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 24 24"
      className={className}
      fill={fill}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{label}</title>
      <path d={path} />
    </svg>
  )
}

/**
 * A brand logo floating on its own colour bloom.
 *
 * Sized for the picker: smaller than the public site's skill cards. The glow
 * and icon are both scaled down to fit the condensed admin UI.
 *
 * Falls back to `null` for an unknown slug — callers branch on that and render
 * their own neutral placeholder.
 */
export function TechIconTile({ slug, title, size = 'h-9 w-9', iconSize = 'h-5 w-5', className = '' }) {
  const glow = brandGlowStyle(slug)
  if (!glow) return null

  return (
    <span
      className={`tech-glow relative flex items-center justify-center ${size} ${className}`}
      style={glow}
    >
      <span aria-hidden className="tech-glow__bloom" style={{ inset: '-8px' }} />
      <TechIcon slug={slug} title={title} tone="display" className={`relative ${iconSize}`} />
    </span>
  )
}
