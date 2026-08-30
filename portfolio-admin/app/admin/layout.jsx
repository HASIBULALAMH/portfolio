'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/admin/Sidebar'
import { Header } from '@/components/admin/Header'
import { ToastProvider, useToast } from '@/components/ui/toast'
import { SettingsProvider } from '@/lib/settings'
import { apiCall } from '@/lib/api'

const MAX_AUTH_ATTEMPTS = 3
const RETRY_DELAY_MS = 1500

function AdminShell({ children }) {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { showToast } = useToast()

  // Guards against a redirect loop when /admin/me keeps failing: we retry a
  // bounded number of times, then give up and send the user to login once.
  const attemptsRef = useRef(0)
  const redirectedRef = useRef(false)

  const redirectToLogin = useCallback(
    (message) => {
      if (redirectedRef.current) return
      redirectedRef.current = true
      localStorage.removeItem('auth_token')
      localStorage.removeItem('admin_user')
      if (message) showToast(message, 'error')
      setTimeout(() => router.replace('/login'), message ? RETRY_DELAY_MS : 0)
    },
    [router, showToast]
  )

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsLoading(false);
        redirectToLogin();
        return;
      }

      while (!cancelled && attemptsRef.current < MAX_AUTH_ATTEMPTS) {
        attemptsRef.current += 1;
        const result = await apiCall('GET', '/admin/me');
        if (cancelled) return;

        if (result.success) {
          setUser(result.data);
          setIsAuthenticated(true);
          localStorage.setItem('admin_user', JSON.stringify(result.data));
          setIsLoading(false);
          // Reset the budget so a later re-run of this effect starts with a
          // full set of attempts. Without this the counter only ever climbs,
          // and a second run would skip the loop entirely and fall through to
          // redirectToLogin — which redirectedRef then suppresses, leaving the
          // panel stuck on "Loading..." with no way out.
          attemptsRef.current = 0;
          return;
        }

        // A 401 is definitive — the token is bad, so retrying cannot help.
        // Only transient failures (network/server) are worth another attempt.
        const isTransient =
          result.errorType === 'NETWORK' || result.errorType === 'SERVER';
        if (!isTransient) break;

        if (attemptsRef.current < MAX_AUTH_ATTEMPTS) {
          showToast(
            `Couldn't verify your session — retrying (${attemptsRef.current}/${MAX_AUTH_ATTEMPTS})...`,
            'info',
          );
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }

      if (cancelled) return;
      setIsLoading(false);
      redirectToLogin('Unable to verify session — redirecting to login...');
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [redirectToLogin, showToast])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="flex h-screen bg-background bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          user={user}
          onLogout={() => {
            localStorage.removeItem('auth_token')
            localStorage.removeItem('admin_user')
            router.replace('/login')
          }}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
        {/* `relative` is load-bearing, not cosmetic: it makes this element the
            containing block for its absolutely-positioned descendants. Without
            it, the nearest positioned ancestor is the initial containing block,
            so `overflow-auto` here does not clip them and they contribute to the
            DOCUMENT's scroll height instead of this element's. The visually
            hidden `.sr-only` labels (position:absolute) sitting far down a long
            form — Hero's role and social-link rows — then stretched the document
            ~1.8k px past the h-screen shell, producing an outer scrollbar over
            nothing but the gradient background. */}
        <main className="relative flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function AdminLayout({ children }) {
  return (
    <ToastProvider>
      {/* Wraps the shell so the settings fetch is shared by every consumer
          (currently the sidebar wordmark) instead of refetched per component. */}
      <SettingsProvider>
        <AdminShell>{children}</AdminShell>
      </SettingsProvider>
    </ToastProvider>
  )
}
