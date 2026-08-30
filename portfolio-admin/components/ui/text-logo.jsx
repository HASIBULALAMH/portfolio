import { cn } from '@/lib/utils'

/**
 * The site's wordmark, rendered from a string instead of an uploaded image.
 *
 * Copy of portfolio-frontend/components/portfolio/text-logo.jsx. The two apps
 * are separate Next.js builds with no shared package (the same reason
 * lib/social-platforms.js and the settings fallback exist in both), so the
 * component is duplicated rather than imported. Keep the two in sync: the whole
 * value of the admin's live preview is that it renders exactly what the public
 * site will render.
 *
 * All of the wordmark's styling lives in this file, on purpose. It used to lean
 * on two shared globals.css classes, and both were the wrong seam:
 *   - `.text-gradient` is the public Hero heading's gradient. Sharing it means
 *     the wordmark cannot be retuned without also restyling the Hero, so the
 *     logo's violet is spelled out here instead.
 *   - `.logo-glow` was only ever used by this component, so a global utility
 *     bought nothing and split the wordmark across two files per app.
 * Inlining it also means this file is now the ONLY thing that has to match the
 * public copy — there is no second globals.css block to keep in sync.
 *
 * The glow and the gradient MUST stay on two nested elements. `background-clip:
 * text` plus `filter` on a single element renders inconsistently across
 * browsers — the filter can rasterise the clip and drop the gradient entirely.
 * The outer element carries the glow and the type; the inner carries the fill.
 *
 * `capitalize` is presentational, not a rewrite of the stored value: it lifts an
 * all-lowercase `logo_text` ("hasibul alam") to a brand mark ("Hasibul Alam")
 * while leaving a deliberately stylised value ("HASIBUL.") untouched, since
 * text-transform only ever raises the first letter of each word. The Settings
 * field remains the source of truth for the wording itself.
 *
 * Sizing is a prop, not hardcoded pixels: the same component renders small in
 * the sidebar and large in the Settings live preview. `inherit` takes the size
 * from whatever wraps it.
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
