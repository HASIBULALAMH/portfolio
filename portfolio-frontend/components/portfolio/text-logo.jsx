import { cn } from '@/lib/utils'

/**
 * The site's wordmark, rendered from a string instead of an uploaded image.
 *
 * All of the wordmark's styling lives in this file, on purpose. It used to lean
 * on two shared globals.css classes, and both were the wrong seam:
 *   - `.text-gradient` is the Hero heading's gradient. Sharing it means the
 *     wordmark cannot be retuned without also restyling the Hero — so the logo's
 *     violet is spelled out here instead. The Hero keeps `.text-gradient`.
 *   - `.logo-glow` was only ever used by this component, so a global utility
 *     bought nothing and split the wordmark's definition across two files (times
 *     two apps, since the admin keeps its own copy of both).
 * Keeping it inline means one file defines the mark, and the admin copy stays in
 * sync by copying this file alone.
 *
 * The glow and the gradient MUST stay on two nested elements. `background-clip:
 * text` plus `filter` on a single element renders inconsistently across
 * browsers — the filter can rasterise the clip and drop the gradient entirely.
 * The outer element carries the glow and the type; the inner carries the fill.
 *
 * `capitalize` is presentational, not a rewrite of the stored value: it lifts an
 * all-lowercase `logo_text` ("hasibul alam") to a brand mark ("Hasibul Alam")
 * while leaving a deliberately stylised value ("HASIBUL.") untouched, since
 * text-transform only ever raises the first letter of each word. The stored
 * setting stays the source of truth — set it in Site Settings to control the
 * wording itself.
 *
 * Sizing is a prop, not hardcoded pixels: the same component renders small in a
 * 16px-tall header slot and large in the admin's live preview. `inherit` takes
 * the size from whatever wraps it, which is how the Navbar/Footer/Sidebar use it
 * — those slots already set their own text size for the layout they live in.
 */
const SIZES = {
  inherit: '',
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-3xl',
  xl: 'text-5xl',
}

export function TextLogo({
  text,
  size = 'inherit',
  className,
  as: Tag = 'span',
  ...props
}) {
  // A blank string would render an invisible logo, so callers are expected to
  // have resolved a fallback already (see resolveLogo in lib/logo.js). This
  // guard is the last line of defence rather than the primary one.
  const label = typeof text === 'string' ? text.trim() : ''
  if (!label) return null

  return (
    <Tag
      // Glow on the outer element, gradient on the inner one — see the note above
      // for why a single element loses the gradient in some browsers.
      className={cn(
        'inline-block font-heading font-extrabold capitalize tracking-tight leading-none',
        'drop-shadow-[0_0_6px_rgba(124,58,237,0.4)]',
        SIZES[size] ?? SIZES.inherit,
        className,
      )}
      {...props}
    >
      <span className="bg-gradient-to-b from-[#A78BFA] to-[#7C3AED] bg-clip-text text-transparent">
        {label}
      </span>
    </Tag>
  )
}
