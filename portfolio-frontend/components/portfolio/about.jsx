'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Image from 'next/image'
import { Reveal, SectionHeading } from './reveal'

export function About({ about = {}, contactInfo = {} }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  const {
    bio_paragraph_1: bioOne,
    bio_paragraph_2: bioTwo,
    image_path: imagePath,
    image_alt: imageAlt,
  } = about

  // The info pills used to be a hardcoded list. Location now comes from the
  // contact record; the rest are derived from the About stats, so everything
  // here is editable in the admin panel.
  const stats = Array.isArray(about.stats) ? about.stats : []

  const infoPills = [
    contactInfo.location && {
      label: 'Location',
      value: contactInfo.location,
    },
    ...stats.slice(0, 3).map((stat) => ({
      label: stat.label,
      value: stat.value,
    })),
  ].filter(Boolean)

  return (
    // Sized by its content, like every other content section. This used to be
    // `min-h-screen` with the content flex-centred inside it, which padded a
    // ~620px block out to a full 900px viewport and split the ~280px remainder
    // above and below — that slack, not the padding, was the largest single
    // contributor to the gap on either side of About.
    <section
      id="about"
      ref={ref}
      className="w-full px-4 py-12 md:py-16"
    >
      <div className="max-w-6xl w-full mx-auto">
        <SectionHeading title="About Me" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-stretch mt-12">
          {/* Portrait Frame — stretches to the full height of the bio column
              beside it. The grid row is sized by the text column (bio + stat
              pills); `h-full` on both the Reveal wrapper and the frame lets the
              portrait fill that height instead of stopping short at its own
              fixed height. `md:min-h-96` keeps the old height as a floor so a
              short bio can never collapse the frame. */}
          <Reveal className="h-full">
            <motion.div
              className="relative h-64 md:h-full md:min-h-96 rounded-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.6 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl" />
              {/* No `priority` here — this image is below the fold. The hero
                  portrait is the LCP element and carries `priority` instead. */}
              <Image
                src={imagePath || '/hasibul-portrait.png'}
                alt={imageAlt || 'Hasibul Alam'}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover object-[center_25%]"
              />
              <div className="absolute inset-0 border-2 border-primary/30 rounded-2xl" />
            </motion.div>
          </Reveal>

          {/* Content */}
          <Reveal>
            <div className="space-y-6">
              <motion.p
                className="text-base md:text-lg leading-relaxed text-secondary-foreground/80"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                {bioOne}
              </motion.p>

              <motion.p
                className="text-base md:text-lg leading-relaxed text-secondary-foreground/80"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                {bioTwo}
              </motion.p>

              {/* Info pills — the single place on the page carrying the About
                  stats. They already sit directly below the bio, so the
                  standalone band that used to follow the Hero and the separate
                  text strip that duplicated it here were both removed rather
                  than kept as a second and third copy of the same numbers.
                  Hidden entirely when there is nothing to show. */}
              <motion.div
                className="grid grid-cols-2 gap-3 pt-4"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                {infoPills.map((pill, index) => (
                  <motion.div
                    key={`${pill.label}-${index}`}
                    className="p-3 md:p-4 rounded-lg bg-primary/10 border border-primary/20 backdrop-blur-sm"
                    whileHover={{ scale: 1.05, backgroundColor: 'rgba(70, 72, 212, 0.15)' }}
                    transition={{ duration: 0.3 }}
                  >
                    <p className="text-xs text-secondary-foreground/70 mb-1">{pill.label}</p>
                    <p className="text-sm md:text-base font-semibold text-primary">{pill.value}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
