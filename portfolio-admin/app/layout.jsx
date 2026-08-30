import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { fetchSettings } from '@/lib/settings-server'

const FALLBACK_ICONS = {
  icon: [
    {
      url: '/icon-light-32x32.png',
      media: '(prefers-color-scheme: light)',
    },
    {
      url: '/icon-dark-32x32.png',
      media: '(prefers-color-scheme: dark)',
    },
    {
      url: '/icon.svg',
      type: 'image/svg+xml',
    },
  ],
  apple: '/apple-icon.png',
}

/**
 * Title and favicon come from the same Site Settings row the public site uses,
 * so changing the brand in one place updates both apps.
 *
 * The title is suffixed with "Admin" to distinguish this tab from the public
 * site when both are open, which is the normal case while editing.
 */
export async function generateMetadata() {
  const settings = await fetchSettings()
  const siteTitle = settings.site_title?.trim() || 'Portfolio'

  return {
    title: `${siteTitle} — Admin`,
    description: `Content management for ${siteTitle}.`,
    // An uploaded favicon replaces the bundled set; otherwise keep the
    // light/dark pair that ships with the app.
    icons: settings.favicon_path
      ? { icon: [{ url: settings.favicon_path }] }
      : FALLBACK_ICONS,
  }
}

export const viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased font-sans">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
