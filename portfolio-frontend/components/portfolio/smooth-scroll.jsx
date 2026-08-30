'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'

/**
 * Initialises Lenis smooth scrolling.
 *
 * This lives in its own client component so app/page.jsx can be a server
 * component and fetch content during rendering. Renders nothing itself.
 */
export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })

    let rafId

    function raf(time) {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }

    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
    }
  }, [])

  return null
}
