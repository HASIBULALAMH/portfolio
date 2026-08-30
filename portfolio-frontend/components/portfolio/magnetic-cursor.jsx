'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

export function MagneticCursor() {
  const cursorRef = useRef(null)
  const mousePos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e) => {
      mousePos.current = { x: e.clientX, y: e.clientY }

      if (cursorRef.current) {
        cursorRef.current.style.left = `${e.clientX}px`
        cursorRef.current.style.top = `${e.clientY}px`
      }
    }

    const handleMouseLeave = () => {
      if (cursorRef.current) {
        cursorRef.current.style.opacity = '0'
      }
    }

    const handleMouseEnter = () => {
      if (cursorRef.current) {
        cursorRef.current.style.opacity = '1'
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mouseenter', handleMouseEnter)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('mouseenter', handleMouseEnter)
    }
  }, [])

  return (
    <motion.div
      ref={cursorRef}
      className="fixed pointer-events-none z-40 hidden lg:block"
      style={{
        width: '24px',
        height: '24px',
        border: '2px solid',
        borderColor: 'rgb(70, 72, 212)',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: 0,
      }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
    />
  )
}
