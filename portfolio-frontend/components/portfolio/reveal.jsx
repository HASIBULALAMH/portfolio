'use client'

import { motion } from 'framer-motion'

export function Reveal({ children, delay = 0, y = 24, className }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function SectionHeading({ title, eyebrow }) {
  return (
    <div className="mb-12 flex flex-col items-center text-center">
      {eyebrow && (
        <span className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-accent">
          {eyebrow}
        </span>
      )}
      <h2 className="text-balance font-heading text-3xl font-bold text-foreground sm:text-4xl md:text-5xl">
        {title}
      </h2>
      <span className="mt-4 h-1 w-20 rounded-full bg-gradient-to-r from-primary to-accent" />
    </div>
  )
}
