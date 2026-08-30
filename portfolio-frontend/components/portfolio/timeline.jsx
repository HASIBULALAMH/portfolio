'use client'

import { motion } from 'framer-motion'
import { SectionHeading } from './reveal'
import { cn } from '@/lib/utils'

/**
 * Experience and education timeline.
 *
 * One component for both types by design — the card, layout, dot and animation
 * are identical either way. `type` only selects the label shown against the
 * subject_or_role field ("Role" vs "Subject"); the institute_or_company value
 * fills the same visual slot regardless.
 *
 * Falls back to the legacy `company`/`title` columns for rows created before
 * the type migration, which the API still returns.
 */
const TYPE_LABELS = {
  education: { subject: 'Subject' },
  experience: { subject: 'Role' },
}

export function Timeline({ items = [] }) {
  const entries = Array.isArray(items) ? items : []

  return (
    <section id="journey" className="relative py-12 md:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHeading eyebrow="Experience & Education" title="My Journey" />

        {entries.length === 0 ? (
          <p className="text-center text-muted-foreground">
            Timeline coming soon.
          </p>
        ) : (
          <div className="relative">
            {/* center line */}
            <div
              aria-hidden
              className="absolute left-4 top-0 h-full w-px bg-gradient-to-b from-primary/60 via-accent/40 to-transparent md:left-1/2 md:-translate-x-1/2"
            />

            <div className="space-y-10">
              {entries.map((item, i) => {
                const isLeft = i % 2 === 0

                const heading = item.institute_or_company || item.company
                const subject = item.subject_or_role || item.title
                const period = item.year_range || item.year
                const subjectLabel =
                  (TYPE_LABELS[item.type] || TYPE_LABELS.experience).subject

                return (
                  <motion.div
                    key={item.id ?? `${heading}-${i}`}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.5 }}
                    className={cn(
                      'relative pl-12 md:w-1/2 md:pl-0',
                      isLeft ? 'md:pr-12 md:text-right' : 'md:ml-auto md:pl-12',
                    )}
                  >
                    {/* dot */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-4 top-6 z-10 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-primary ring-4 ring-primary/20 md:top-7',
                        isLeft ? 'md:left-auto md:right-0 md:translate-x-1/2' : 'md:left-0 md:-translate-x-1/2',
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    </span>

                    <div className="glass rounded-xl p-6 transition-all duration-300 hover:border-accent/50">
                      <span className="inline-flex rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-accent ring-1 ring-primary/30">
                        {period}
                      </span>
                      <h3 className="mt-3 font-heading text-lg font-bold text-foreground">
                        {heading}
                      </h3>
                      {subject && (
                        <p className="text-sm font-medium text-accent">
                          <span className="text-muted-foreground">{subjectLabel}: </span>
                          {subject}
                        </p>
                      )}
                      {item.description && (
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
