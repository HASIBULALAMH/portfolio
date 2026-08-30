'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import NextImage from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema } from '@/lib/validation'
import { apiCall } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toast, ToastContainer, useToast } from '@/components/ui/toast'
import { SettingsProvider, useSettings } from '@/lib/settings'
import { resolveLogo } from '@/lib/logo'
import { TextLogo } from '@/components/ui/text-logo'

/**
 * The brand lockup, showing the uploaded logo when Site Settings has one.
 *
 * `GET /settings` is public — the same endpoint the signed-out public site
 * calls — so this works before login and must NOT be placed behind any auth
 * check. Falls back to the styled text wordmark when the logo type is text or
 * the upload is missing, which is the same fallback the admin Sidebar and the
 * public Header/Footer use.
 */
function LoginBrand() {
  const settings = useSettings()
  const logo = resolveLogo(settings)

  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold mb-2">
        {logo.kind === 'image' ? (
          <NextImage
            src={logo.src}
            alt={logo.alt}
            width={160}
            height={40}
            // h-* with w-auto changes only one axis, which makes next/image warn
            // about a possibly-distorted aspect ratio. Setting width:auto here
            // tells it the other axis is intentionally free.
            style={{ width: 'auto', height: 'auto' }}
            className="mx-auto max-h-10 w-auto object-contain"
            priority
          />
        ) : (
          <TextLogo text={logo.text} />
        )}
      </h1>
      <p className="text-muted-foreground">CMS Admin Panel</p>
    </div>
  )
}

function LoginForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const { showToast, toasts, removeToast } = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data) => {
    setIsLoading(true)
    const result = await apiCall('POST', '/login', data)

    if (result.success) {
      localStorage.setItem('auth_token', result.data.token)
      localStorage.setItem('admin_user', JSON.stringify(result.data.user))
      showToast('Logged in successfully!', 'success')
      setTimeout(() => {
        router.push('/admin/dashboard')
      }, 500)
    } else {
      // Provide specific feedback for network errors
      if (result.errorType === 'NETWORK') {
        showToast("Can't reach the server — check your connection", 'error')
      } else {
        showToast(result.message || 'Login failed', 'error')
      }
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 relative overflow-hidden">
      {/* Animated background gradient orbs */}
      <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 left-20 w-72 h-72 bg-violet-500/10 rounded-full blur-3xl animate-pulse" />
      
      <div className="w-full max-w-md relative z-10">
        <div className="glass-card rounded-2xl p-8 shadow-2xl border border-slate-700/40">
          <LoginBrand />

          {/* method="post" matters even though JS handles the submit: if the
              visitor hits Enter before React hydrates, the browser performs a
              native submission. Without a method that defaults to GET, which
              serialises the password into the URL (?password=...) where it is
              recorded in history, access logs and Referer headers. */}
          <form
            method="post"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5"
          >
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                {...register('email')}
                disabled={isLoading}
                className="bg-slate-800/50 border-slate-600/50 text-foreground placeholder:text-slate-400"
              />
              {errors.email && (
                <p className="text-sm text-destructive mt-2">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                disabled={isLoading}
                className="bg-slate-800/50 border-slate-600/50 text-foreground placeholder:text-slate-400"
              />
              {errors.password && (
                <p className="text-sm text-destructive mt-2">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full mt-7 bg-primary hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition-all duration-200 shadow-lg hover:shadow-indigo-500/40 border border-indigo-400/20"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* The seeded admin account is the only login. Credentials are
              deliberately not printed here — they used to show a stale
              admin@example.com / password pair that no longer works. */}
          <p className="mt-6 text-center text-xs text-slate-400">
            Use your administrator account to sign in.
          </p>
        </div>
      </div>

      <ToastContainer>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </ToastContainer>
    </div>
  )
}

/**
 * SettingsProvider is mounted here rather than in the root layout because the
 * admin shell (app/admin/layout.jsx) already provides it for every signed-in
 * page. The login route is outside that shell, so it needs its own provider to
 * reach the public settings endpoint.
 */
export default function LoginPage() {
  return (
    <SettingsProvider>
      <LoginForm />
    </SettingsProvider>
  )
}
