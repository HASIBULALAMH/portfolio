/**
 * Server-side data access for the public site.
 *
 * Every helper here is safe to call from a server component and never throws:
 * if the backend is down, slow, or returns something unexpected, the caller
 * gets the supplied fallback instead of an exception. A portfolio that renders
 * stale-but-complete content beats one that 500s because the API restarted.
 */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
).replace(/\/$/, '')

// Mostly-static content, so cache for a minute rather than fetching per request.
const REVALIDATE_SECONDS = 60

/**
 * Fetch one endpoint and unwrap the API's { data, message, errors } envelope.
 *
 * @param {string} path      endpoint path, e.g. '/hero'
 * @param {unknown} fallback returned when the request or shape check fails
 */
export async function fetchFromApi(path, fallback = null) {
  const url = `${API_BASE_URL}${path}`

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: REVALIDATE_SECONDS },
    })

    if (!response.ok) {
      console.warn(`[api] ${path} responded ${response.status}; using fallback`)
      return fallback
    }

    const payload = await response.json()

    // A successful response always carries a `data` key. `data: null` is valid
    // (an unset singleton), so only a missing key counts as malformed.
    if (!payload || !('data' in payload)) {
      console.warn(`[api] ${path} returned an unexpected shape; using fallback`)
      return fallback
    }

    return payload.data ?? fallback
  } catch (error) {
    // Network error, DNS failure, timeout, invalid JSON — all non-fatal here.
    console.warn(`[api] ${path} failed: ${error.message}; using fallback`)
    return fallback
  }
}

/** Same as fetchFromApi but guarantees an array, so `.map` is always safe. */
export async function fetchList(path, fallback = []) {
  const data = await fetchFromApi(path, fallback)
  return Array.isArray(data) ? data : fallback
}

export const getSettings = () => fetchFromApi('/settings')
/**
 * Section visibility and ordering — drives both which sections the homepage
 * renders and which links the navbar shows, so one fetch answers both.
 */
export const getSectionVisibility = () => fetchList('/section-visibility')
export const getHero = () => fetchFromApi('/hero')
export const getAbout = () => fetchFromApi('/about')
export const getSkills = () => fetchList('/skills')
export const getTimeline = () => fetchList('/timeline')
export const getProjects = () => fetchList('/projects')
export const getApiShowcases = () => fetchList('/api-showcases')
export const getTestimonials = () => fetchList('/testimonials')
export const getContactInfo = () => fetchFromApi('/contact-info')

/** A single project with its case-study body, or null when the slug is unknown. */
export const getProject = (slug) =>
  fetchFromApi(`/projects/${encodeURIComponent(slug)}`)

/**
 * Load everything the homepage needs in one pass. Requests run concurrently,
 * and Promise.all is safe because no helper rejects.
 */
export async function getHomePageData() {
  const [
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
  ] = await Promise.all([
    getSettings(),
    getSectionVisibility(),
    getHero(),
    getAbout(),
    getSkills(),
    getTimeline(),
    getProjects(),
    getApiShowcases(),
    getTestimonials(),
    getContactInfo(),
  ])

  return {
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
  }
}
