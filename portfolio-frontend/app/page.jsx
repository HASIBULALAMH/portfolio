import { Fragment } from 'react'
import { Navbar } from '@/components/portfolio/navbar'
import { Hero } from '@/components/portfolio/hero'
import { About } from '@/components/portfolio/about'
import { Skills } from '@/components/portfolio/skills'
import { Projects } from '@/components/portfolio/projects'
import { APIShowcase } from '@/components/portfolio/api-showcase'
import { Timeline } from '@/components/portfolio/timeline'
import { Testimonials } from '@/components/portfolio/testimonials'
import { Contact } from '@/components/portfolio/contact'
import { Footer } from '@/components/portfolio/footer'
import { LoadingScreen } from '@/components/portfolio/loading-screen'
import { ScrollProgress } from '@/components/portfolio/scroll-progress'
import { BackToTop } from '@/components/portfolio/back-to-top'
import { NoiseTexture } from '@/components/portfolio/noise-texture'
import { MagneticCursor } from '@/components/portfolio/magnetic-cursor'
import { SmoothScroll } from '@/components/portfolio/smooth-scroll'
import { getHomePageData } from '@/lib/api'
import {
  FALLBACK_ABOUT,
  FALLBACK_CONTACT_INFO,
  FALLBACK_HERO,
  FALLBACK_SECTIONS,
  FALLBACK_SETTINGS,
} from '@/lib/fallbacks'

/**
 * A server component: content is fetched during rendering and passed down as
 * props, so the page ships as HTML rather than fetching on the client. Lenis
 * smooth scrolling moved into <SmoothScroll /> because it needs the browser.
 *
 * lib/api.js never throws, so a backend outage degrades each section to its
 * fallback instead of failing the whole page.
 */
export default async function Page() {
  const {
    settings,
    sections,
    hero,
    about,
    skills,
    timeline,
    projects,
    apiShowcases,
    testimonials,
    contactInfo,
  } = await getHomePageData()

  const resolvedSettings = settings ?? FALLBACK_SETTINGS
  const resolvedSections = sections.length > 0 ? sections : FALLBACK_SECTIONS
  // An unset singleton comes back with empty strings rather than null, so fall
  // back whenever the field that actually drives the section is blank.
  const resolvedHero = hero?.heading ? hero : FALLBACK_HERO
  const resolvedAbout = about?.bio_paragraph_1 ? about : FALLBACK_ABOUT
  const resolvedContact = contactInfo?.email ? contactInfo : FALLBACK_CONTACT_INFO

  const stats =
    Array.isArray(resolvedAbout.stats) && resolvedAbout.stats.length > 0
      ? resolvedAbout.stats
      : FALLBACK_ABOUT.stats

  /**
   * One entry per section_key: how to render it, and whether it has anything
   * to render.
   *
   * `hasContent` matters because the list-backed sections already return null
   * when handed an empty array — so "visible" alone does not mean "on the
   * page". Without this, an enabled-but-empty section would still contribute a
   * nav link, and that link would scroll to an anchor that does not exist.
   * Adding a section means adding a row to section_visibility plus an entry
   * here; the nav link then follows automatically.
   */
  const SECTION_REGISTRY = {
    hero: {
      hasContent: true,
      render: () => <Hero hero={resolvedHero} />,
    },
    about: {
      hasContent: true,
      render: () => (
        <About about={{ ...resolvedAbout, stats }} contactInfo={resolvedContact} />
      ),
    },
    skills: {
      hasContent: skills.length > 0,
      render: () => <Skills categories={skills} />,
    },
    projects: {
      hasContent: projects.length > 0,
      render: () => <Projects projects={projects} hero={resolvedHero} />,
    },
    api_showcase: {
      hasContent: apiShowcases.length > 0,
      render: () => <APIShowcase showcases={apiShowcases} />,
    },
    timeline: {
      hasContent: timeline.length > 0,
      render: () => <Timeline items={timeline} />,
    },
    testimonials: {
      hasContent: testimonials.length > 0,
      render: () => <Testimonials testimonials={testimonials} />,
    },
    contact: {
      hasContent: true,
      render: () => <Contact hero={resolvedHero} contactInfo={resolvedContact} />,
    },
  }

  const visibleSections = resolvedSections.filter(
    (section) => section.is_visible && SECTION_REGISTRY[section.section_key]?.hasContent,
  )

  // The navbar and footer link only to sections that actually rendered, so a
  // hidden — or empty — section never leaves a link pointing at a missing
  // anchor. Derived here rather than fetched again: same data, one request.
  const navLinks = visibleSections.map((section) => ({
    id: section.id,
    label: section.label,
    href: section.nav_href,
  }))

  return (
    <>
      <LoadingScreen />
      <ScrollProgress />
      <BackToTop />
      <MagneticCursor />
      <NoiseTexture />
      <SmoothScroll />
      <main className="relative min-h-screen overflow-x-hidden">
        <Navbar navItems={navLinks} settings={resolvedSettings} />
        {visibleSections.map((section) => (
          <Fragment key={section.section_key}>
            {SECTION_REGISTRY[section.section_key].render()}
          </Fragment>
        ))}
        <Footer
          settings={resolvedSettings}
          navItems={navLinks}
          hero={resolvedHero}
        />
      </main>
    </>
  )
}
