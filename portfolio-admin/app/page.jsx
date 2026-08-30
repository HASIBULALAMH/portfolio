'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is authenticated and redirect to dashboard.
    // The login route is /login (app/(auth)/login) — "/admin/login" does not
    // exist and previously 404'd for signed-out visitors.
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    if (token) {
      router.replace('/admin/dashboard')
    } else {
      router.replace('/login')
    }
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </main>
  )
}
