import Image from 'next/image'
import { SocialIcon } from './social-icons'
import { TextLogo } from './text-logo'
import { usableSocialLinks } from '@/lib/social-platforms'
import { resolveLogo } from '@/lib/logo'

/**
 * Site footer. Brand, nav links and copyright all come from the admin-managed
 * settings and nav records; social links come from the hero record, which is
 * where they are edited.
 *
 * `settings` arrives as a prop from app/page.jsx, which already fetches it for
 * the Navbar — no second fetch here.
 */
export function Footer({ settings = {}, navItems = [], hero = {} }) {
  // Still needed for the copyright line below, which is a sentence about the
  // brand rather than the logo slot.
  const brandName = settings.brand_name || 'Hasibul'
  const links = Array.isArray(navItems) ? navItems : []

  // Same helper the Navbar uses, so the header and footer logos can never
  // disagree about type or fallback. See lib/logo.js.
  const logo = resolveLogo(settings)

  // Same helper the Hero and Contact use, so all three render the same set.
  const socialLinks = usableSocialLinks(hero.social_links)

  const copyright =
    settings.copyright_text ||
    `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`

  return (
    <footer className="border-t border-border bg-secondary/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-10 sm:px-6 md:flex-row md:justify-between">
        {/* Mirrors the Navbar wordmark slot: an uploaded logo replaces the text
            rather than sitting beside it. No `priority` here — the footer is
            below the fold, so this image should not compete with the header's
            copy for early bandwidth. */}
        <a
          href="#home"
          className="font-heading text-xl font-bold tracking-tight text-foreground"
        >
          {logo.kind === 'image' ? (
            <Image
              src={logo.src}
              alt={logo.alt}
              width={160}
              height={40}
              // See navbar.jsx: one-axis constraints make next/image warn about
              // aspect ratio unless the other axis is explicitly auto.
              style={{ width: 'auto', height: 'auto' }}
              className="max-h-10 w-auto object-contain"
            />
          ) : (
            <TextLogo text={logo.text} />
          )}
        </a>

        {links.length > 0 && (
          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {links.map((link) => (
                <li key={link.id ?? link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {socialLinks.length > 0 && (
          <div className="flex items-center gap-3">
            {socialLinks.map(({ platform, label, href }) => (
              <a
                key={platform}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300 hover:border-accent hover:text-accent"
              >
                <SocialIcon platform={platform} className="h-4 w-4" />
              </a>
            ))}
          </div>
        )}
      </div>

      {settings.footer_text && (
        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 pt-5 text-center text-sm text-muted-foreground sm:px-6">
            {settings.footer_text}
          </p>
        </div>
      )}

      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-center text-sm text-muted-foreground sm:px-6">
          {copyright}
        </p>
      </div>
    </footer>
  )
}
