/**
 * Fallback content used when the backend has no data for a section yet, or is
 * unreachable.
 *
 * These are the values the components previously hardcoded. Keeping them means
 * a fresh database or a restarting API degrades to a complete-looking page
 * instead of a blank one. Anything managed through the admin panel overrides
 * whatever is here.
 */

export const FALLBACK_SETTINGS = {
  site_title: 'Hasibul Alam — Laravel & Vue.js Full-Stack Developer',
  brand_name: 'Hasibul',
  footer_text: '',
  copyright_text: `© ${new Date().getFullYear()} Hasibul Alam. Made with ❤️ in Dhaka`,
  accent_color: '#4648D4',
  // With the API unreachable there is no uploaded file to point at, so the text
  // logo is the only option that can actually render. logo_text is blank
  // because resolveLogo falls back to brand_name, keeping one source of truth.
  logo_type: 'text',
  logo_text: '',
  logo_path: null,
  logo_alt: '',
  favicon_path: null,
}

/**
 * Section order and visibility used when /section-visibility is unreachable.
 *
 * Mirrors the rows seeded by the backend's SectionVisibilitySeeder, including
 * `section_key` — page.jsx keys its section components off that value, so a key
 * that does not match a component slot silently drops the section. `nav_href`
 * anchors must likewise match the DOM ids in components/portfolio/*.jsx.
 *
 * Everything defaults to visible here: an API outage should degrade to a
 * complete page, never to a page that looks deliberately stripped down.
 */
export const FALLBACK_SECTIONS = [
  { id: 'f-hero', section_key: 'hero', label: 'Home', nav_href: '#home', is_visible: true, order: 0 },
  { id: 'f-about', section_key: 'about', label: 'About', nav_href: '#about', is_visible: true, order: 1 },
  { id: 'f-skills', section_key: 'skills', label: 'Skills', nav_href: '#skills', is_visible: true, order: 2 },
  { id: 'f-projects', section_key: 'projects', label: 'Projects', nav_href: '#projects', is_visible: true, order: 3 },
  { id: 'f-apis', section_key: 'api_showcase', label: 'APIs', nav_href: '#apis', is_visible: true, order: 4 },
  { id: 'f-journey', section_key: 'timeline', label: 'Journey', nav_href: '#journey', is_visible: true, order: 5 },
  { id: 'f-testimonials', section_key: 'testimonials', label: 'Testimonials', nav_href: '#testimonials', is_visible: true, order: 6 },
  { id: 'f-contact', section_key: 'contact', label: 'Contact', nav_href: '#contact', is_visible: true, order: 7 },
]

export const FALLBACK_HERO = {
  heading: 'Hasibul Alam',
  subheading:
    'Building scalable, high-performance web applications for the modern web.',
  cta_primary_text: 'Hire Me',
  cta_primary_link: '#contact',
  cta_secondary_text: 'View Projects',
  cta_secondary_link: '#projects',
  image_path: '/hasibul-portrait.png',
  image_alt: 'Portrait of Hasibul Alam',
  // These four mirror the admin-managed columns added when the last hardcoded
  // Hero elements moved into the database. `social_links` replaced the fixed
  // github_url/linkedin_url pair, so the fallback carries the same two entries
  // in the same order the migration backfilled them.
  roles: [
    'Laravel Developer',
    'Vue.js Developer',
    'Full-Stack Engineer',
  ],
  tech_badges: [
    { label: 'Laravel', icon_slug: 'laravel' },
    { label: 'Redis', icon_slug: 'redis' },
    { label: 'Vue', icon_slug: 'vuedotjs' },
    { label: 'MySQL', icon_slug: 'mysql' },
  ],
  is_available: true,
  availability_label: 'Available for Work',
  social_links: [
    { platform: 'github', url: 'https://github.com/hasibulalamh' },
    { platform: 'linkedin', url: 'https://linkedin.com/in/hasibulalamh' },
  ],
  email: 'hasibulalamweb@gmail.com',
  cv_path: null,
}

export const FALLBACK_ABOUT = {
  bio_paragraph_1:
    "I'm a full-stack developer passionate about building beautiful, performant web experiences. With expertise in modern frontend technologies and backend systems, I craft digital solutions that solve real problems.",
  bio_paragraph_2:
    "When I'm not coding, you'll find me exploring new technologies, contributing to open source, or sharing knowledge with the community. I believe in continuous learning and writing clean, maintainable code.",
  image_path: '/hasibul-portrait.png',
  image_alt: 'Hasibul Alam',
  stats: [
    { label: 'Years Experience', value: '2+' },
    { label: 'Projects Built', value: '10+' },
    { label: 'Happy Clients', value: '5+' },
    { label: 'Job Commitment', value: '100%' },
  ],
}

export const FALLBACK_CONTACT_INFO = {
  email: 'hasibulalamweb@gmail.com',
  phone: '',
  location: 'Dhaka, Bangladesh',
  calendly_link: '',
  whatsapp_number: '',
}

/**
 * The remaining sections have no fallback content on purpose: projects,
 * testimonials, skills, the timeline and the API showcase were all previously
 * filled with placeholder data that the code itself flagged as unpublishable
 * (invented metrics, invented client quotes, *.example.com links). Rather than
 * preserve that, these sections render an empty state until real content is
 * entered in the admin panel.
 *
 * There are deliberately no FALLBACK_SKILLS / _TIMELINE / _PROJECTS /
 * _API_SHOWCASES / _TESTIMONIALS constants to import: they existed as empty
 * arrays that nothing referenced, because `fetchList()` in lib/api.js already
 * defaults to `[]` on failure. Re-adding them would just be a second way to
 * spell the same empty list.
 */
