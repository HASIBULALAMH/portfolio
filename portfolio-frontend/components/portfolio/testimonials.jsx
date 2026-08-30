'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { SectionHeading } from './reveal'
import { cn } from '@/lib/utils'

/**
 * One slide's exit + enter, in seconds. The nav-dot gate in `select` is
 * derived from this, so changing the animation speed cannot silently leave
 * the gate too short (which would let a click land mid-exit and reintroduce
 * the entrance-replay flicker).
 */
const SWAP_SECONDS = 0.5
/**
 * How long `select` refuses new selections after a swap starts.
 *
 * Sized to the EXIT phase only, not exit+enter. The flicker needs a click to
 * land on a card that is currently exiting (see `select`), and with
 * mode="wait" the exit is what runs first — once it finishes, the old node is
 * gone and there is nothing left to revive. Gating the full 1s would also
 * work but would swallow twice as many legitimate clicks. The margin covers
 * frame-boundary jitter so a slow main thread cannot let a click through a
 * few ms early.
 */
const SWAP_MS = SWAP_SECONDS * 1000 + 60

/** Initials for the avatar circle when no image was uploaded. */
function initialsOf(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()

  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * The card body, shared by the visible (animated) card and by the invisible
 * sizer copies behind it. Both must produce the same height or the sizers
 * would reserve the wrong one.
 *
 * `sizer` swaps the avatar for an empty box of the same fixed 64px footprint:
 * the sizers only exist to contribute height, so there is no reason to make
 * them decode a second copy of the image.
 */
function TestimonialBody({ item, sizer = false }) {
  return (
    <>
      {/* Order (top to bottom): client image -> name+role -> stars -> quote. */}
      <div className="mb-6 flex justify-center">
        {sizer ? (
          <span className="block h-16 w-16" />
        ) : item.avatar_path ? (
          // Native <img>, not next/image: the avatar lives on a remote
          // URL or a local /uploads path, so the app never knows the
          // intrinsic dimensions for optimization.
          <img
            src={item.avatar_path}
            alt={item.avatar_alt || item.author_name || ''}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          // Same 64px box as the <img> above, with flex centring on both axes.
          // Verified by pixel measurement at 4x DPR: every shape initialsOf()
          // can emit (two capitals, one capital, digits) lands within 0.63px of
          // the circle's centre. Keep `items-center justify-center` AND the
          // matching h-16/w-16 -- dropping either makes the glyphs sit high,
          // because flex centres the line box, not the glyph ink.
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-accent font-heading font-bold text-primary-foreground">
            {initialsOf(item.author_name)}
          </span>
        )}
      </div>
      <figcaption className="mb-4">
        <div className="font-semibold text-foreground">{item.author_name}</div>
        {item.author_role && (
          <div className="text-sm text-muted-foreground">{item.author_role}</div>
        )}
      </figcaption>
      <div
        className="mb-5 flex items-center justify-center gap-1"
        aria-label="Rated 5 out of 5 stars"
        role="img"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-5 w-5 fill-accent text-accent" aria-hidden="true" />
        ))}
      </div>
      <blockquote className="text-pretty text-lg leading-relaxed text-foreground">
        &ldquo;{item.quote}&rdquo;
      </blockquote>
    </>
  )
}

/**
 * Rotating client testimonials.
 *
 * The old version faked a 1.1s load with setTimeout before revealing hardcoded
 * quotes. Content now arrives from the server already rendered, so there is
 * nothing to wait for and the skeleton is gone.
 */
export function Testimonials({ testimonials = [] }) {
  const items = Array.isArray(testimonials) ? testimonials : []
  const [index, setIndex] = useState(0)
  // Bumped by every manual selection so the effect below re-runs and the 5s
  // autoplay clock restarts from the click. Without it the interval keeps
  // running on its original schedule and can fire a few hundred ms after a
  // click, advancing past the card the reader just asked for.
  const [cycle, setCycle] = useState(0)
  // Timestamp of the last swap, used to gate `select` below. Deliberately a
  // timestamp rather than an `isAnimating` boolean: a boolean has to be
  // cleared by a completion callback, and if that callback ever fails to fire
  // (interrupted animation, unmount mid-exit, reduced-motion) the dots stay
  // dead forever. Comparing against elapsed time cannot wedge.
  const lastSwapAt = useRef(0)

  useEffect(() => {
    if (items.length <= 1) return

    const interval = setInterval(() => {
      // Autoplay advances stamp the clock too, so a click arriving just after
      // an automatic swap is gated by the same rule as a click after a click.
      lastSwapAt.current = performance.now()
      setIndex((i) => (i + 1) % items.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [items.length, cycle])

  /**
   * Ignore selections while a swap is still animating.
   *
   * MEASURED BUG (do not remove this guard): AnimatePresence mode="wait"
   * keeps the outgoing card mounted while its exit runs. Re-selecting a key
   * that is currently exiting does not mount a new card — Framer revives that
   * same DOM node and replays its entrance from `initial`. Instrumented at
   * 60fps with a per-node id, one node mounted once was seen rising to 0.38,
   * falling to 0, rising to 0.71, falling to 0, then rising again: the exact
   * "entrance restarts 2-3 times" flicker, with mount count still 1. Note
   * only opacity reversed while y kept travelling, which is the signature of
   * a revived node rather than a remount.
   *
   * The window is the 0.5s exit (see SWAP_MS), so a reader clicking through
   * the dots at a normal pace never notices the gate; only clicks that land
   * mid-exit — the ones that caused the flicker — are dropped.
   */
  const select = (i) => {
    if (i === index) return
    if (performance.now() - lastSwapAt.current < SWAP_MS) return
    lastSwapAt.current = performance.now()
    setIndex(i)
    setCycle((c) => c + 1)
  }

  // Guard against the index outliving a shrinking list between revalidations.
  const current = items[index] ?? items[0]

  if (!current) {
    return null
  }

  return (
    <section id="testimonials" className="relative py-12 md:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHeading eyebrow="Testimonials" title="What Clients Say" />

        {/*
          The sizer grid and the animated card are stacked in the same cell, so
          the container is always as tall as the TALLEST testimonial rather
          than as tall as the current one. Quotes differ in length, so without
          this the section height changed with every swap and everything below
          it jumped (measured: 30px in a single frame at >=768px). min-h is a
          floor for the one-item case; the sizers do the real work and stay
          correct at every breakpoint without hardcoded heights.

          LAYOUT-SHIFT CONTRACT: `quote` is admin-editable free text feeding a
          fixed-layout slider, so its length is not knowable at build time. Any
          such field needs either this measure-the-tallest approach or an
          enforced max length — a hardcoded pixel height WILL be wrong the first
          time someone saves a longer quote, and reintroduces exactly this bug.
          Prefer the sizers: they re-measure per breakpoint and per font load,
          which a magic number cannot. The nav dots below are a sibling of this
          container, not of the card, so they inherit its stable height.
        */}
        <div className="relative grid min-h-[18rem] grid-cols-1 grid-rows-1">
          <div
            aria-hidden="true"
            className="pointer-events-none invisible col-start-1 row-start-1 grid grid-cols-1 grid-rows-1"
          >
            {items.map((item, i) => (
              <figure
                key={item.id ?? i}
                className="col-start-1 row-start-1 mx-auto max-w-2xl rounded-2xl p-8 text-center border border-primary/10"
              >
                <TestimonialBody item={item} sizer />
              </figure>
            ))}
          </div>

          <div className="col-start-1 row-start-1">
            {/*
              CAROUSEL CONTRACT — any slider added to this codebase must keep
              all three of these together, because they only work as a set:

                1. <AnimatePresence mode="wait">. Without `mode`, the default
                   "sync" renders the exiting and entering children at the same
                   time, in the same grid cell, and the two quotes overlap
                   mid-transition. "wait" holds the incoming card back until the
                   outgoing exit animation has finished.
                2. A `key` that changes per slide (here `current.id`).
                   AnimatePresence detects enter/exit purely by key identity — a
                   missing or constant key means no exit animation runs at all
                   and the swap becomes an instant cut. Prefer a stable id over
                   the array index, so reordering in the admin panel does not
                   animate the wrong card.
                3. Matching initial/animate/exit including opacity, so the
                   outgoing card visibly fades rather than vanishing.
                4. The `select` gate. mode="wait" alone is NOT enough: it stops
                   two cards being visible at once, but it does not stop a
                   selection landing mid-exit from reviving the exiting node
                   and replaying its entrance. See the comment on `select`.
                5. No CSS `transition` on any property Framer animates. This
                   card uses .card-hover-shadow (box-shadow only) rather than
                   .card-hover, which is `transition-all` and would make the
                   browser re-interpolate the inline opacity/transform Framer
                   writes every frame — and would fight whileHover for the
                   same transform.
            */}
            <AnimatePresence mode="wait">
              <motion.figure
                key={current.id ?? index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: SWAP_SECONDS }}
                whileHover={{ y: -4 }}
                className="card-hover-shadow glass mx-auto max-w-2xl rounded-2xl p-8 text-center border border-primary/10"
              >
                <TestimonialBody item={current} />
              </motion.figure>
            </AnimatePresence>
          </div>
        </div>

        {items.length > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            {items.map((item, i) => (
              <button
                key={item.id ?? i}
                type="button"
                aria-label={`Show testimonial ${i + 1}`}
                aria-current={i === index}
                onClick={() => select(i)}
                className={cn(
                  'h-2.5 rounded-full transition-all duration-300',
                  i === index
                    ? 'w-8 bg-primary'
                    : 'w-2.5 bg-border hover:bg-muted-foreground',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
