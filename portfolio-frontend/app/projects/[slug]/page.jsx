import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'
import { GithubIcon } from '@/components/portfolio/social-icons'
import { getProject, getProjects } from '@/lib/api'

/**
 * Project details page.
 *
 * Replaces the old /case-study/[slug] route — the case study is now one
 * section among several rather than the whole page. Sections, in order:
 * Description, Case Study, Document, then the Live and Git links.
 *
 * Every project gets a page, including those with no case study written: the
 * description and links alone are worth a route, and the Projects grid links
 * here from every card title.
 */
export async function generateStaticParams() {
  const projects = await getProjects()

  return projects.map((project) => ({ slug: project.slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const project = await getProject(slug)

  if (!project) {
    return { title: 'Project not found' }
  }

  return {
    title: `${project.title} — Project`,
    description: project.description || undefined,
  }
}

// `params` is a Promise in Next.js 15+ and must be awaited — reading
// `params.slug` synchronously yields undefined and 404s every project.
export default async function ProjectDetailsPage({ params }) {
  const { slug } = await params
  const project = await getProject(slug)

  if (!project) {
    notFound()
  }

  const detail = project.detail ?? {}
  const results = Array.isArray(detail.results) ? detail.results : []
  const gallery = Array.isArray(detail.gallery_images) ? detail.gallery_images : []
  const technologies = Array.isArray(project.tags) ? project.tags : []
  const documentPath = detail.document_path?.trim() || null

  // The three case-study fields share one section, so it is only rendered when
  // at least one of them has content.
  const hasCaseStudy = Boolean(detail.challenge || detail.solution || results.length > 0)

  return (
    <article className="min-h-screen py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <Link
          href="/#projects"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Link>

        <header className="mb-12">
          <h1 className="mb-4 font-heading text-4xl font-bold text-foreground sm:text-5xl">
            {project.title}
          </h1>

          {(detail.client || detail.date_range) && (
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-sm">
              {detail.client && (
                <div>
                  <dt className="text-muted-foreground">Client</dt>
                  <dd className="font-medium text-foreground">{detail.client}</dd>
                </div>
              )}
              {detail.date_range && (
                <div>
                  <dt className="text-muted-foreground">Timeline</dt>
                  <dd className="font-medium text-foreground">{detail.date_range}</dd>
                </div>
              )}
            </dl>
          )}
        </header>

        {project.image_path && (
          <div className="mb-12 aspect-video w-full overflow-hidden rounded-lg border border-border">
            <Image
              src={project.image_path}
              alt={project.image_alt || project.title}
              width={800}
              height={450}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="mb-12 grid grid-cols-1 gap-12">
          {/* Description — moved here from the project card. */}
          {project.description && (
            <section id="description" data-section="description">
              <h2 className="mb-4 font-heading text-2xl font-bold text-foreground">
                Description
              </h2>
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            </section>
          )}

          {/* Case Study — challenge, solution and results together. */}
          {hasCaseStudy && (
            <section id="case-study" data-section="case-study">
              <h2 className="mb-6 font-heading text-2xl font-bold text-foreground">
                Case Study
              </h2>

              <div className="space-y-8">
                {detail.challenge && (
                  <div>
                    <h3 className="mb-3 font-heading text-lg font-semibold text-foreground">
                      Challenge
                    </h3>
                    <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                      {detail.challenge}
                    </p>
                  </div>
                )}

                {detail.solution && (
                  <div>
                    <h3 className="mb-3 font-heading text-lg font-semibold text-foreground">
                      Solution
                    </h3>
                    <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                      {detail.solution}
                    </p>
                  </div>
                )}

                {results.length > 0 && (
                  <div>
                    <h3 className="mb-3 font-heading text-lg font-semibold text-foreground">
                      Results
                    </h3>
                    <ul className="space-y-2">
                      {results.map((result, index) => (
                        <li
                          key={`${result}-${index}`}
                          className="flex items-start gap-3 text-muted-foreground"
                        >
                          <span className="mt-1 text-primary" aria-hidden="true">✓</span>
                          <span>{result}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Document — the uploaded spec/write-up, opened in a new tab. */}
          {documentPath && (
            <section id="document" data-section="document">
              <h2 className="mb-4 font-heading text-2xl font-bold text-foreground">
                Document
              </h2>
              <a
                href={documentPath}
                target="_blank"
                rel="noopener noreferrer"
                data-project-document
                className="inline-flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-5 py-4 text-foreground transition-all duration-300 hover:border-accent hover:text-accent"
              >
                <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="font-medium">View project document</span>
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              </a>
            </section>
          )}

          {gallery.length > 0 && (
            <section id="gallery" data-section="gallery">
              <h2 className="mb-4 font-heading text-2xl font-bold text-foreground">
                Gallery
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {gallery.map((src, index) => (
                  <div
                    key={`${src}-${index}`}
                    className="aspect-video overflow-hidden rounded-lg border border-border"
                  >
                    <Image
                      src={src}
                      alt={`${project.title} screenshot ${index + 1}`}
                      width={600}
                      height={338}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {technologies.length > 0 && (
            <section id="technologies" data-section="technologies">
              <h2 className="mb-4 font-heading text-2xl font-bold text-foreground">
                Technologies Used
              </h2>
              <div className="flex flex-wrap gap-2">
                {technologies.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full border border-border bg-secondary/30 px-3 py-1.5 text-sm font-medium text-accent"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Live Link and Git Link — each shown only if the URL is set. */}
        {(project.live_url || project.github_url) && (
          <section
            id="links"
            data-section="links"
            className="flex flex-col gap-4 border-t border-border pt-12 sm:flex-row"
          >
            {project.live_url && (
              <a
                href={project.live_url}
                target="_blank"
                rel="noopener noreferrer"
                data-project-live
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-all duration-300 hover:glow-primary hover:brightness-110"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View Live Site
              </a>
            )}
            {project.github_url && (
              <a
                href={project.github_url}
                target="_blank"
                rel="noopener noreferrer"
                data-project-git
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/50 px-6 py-3 font-semibold text-foreground transition-all duration-300 hover:border-accent hover:text-accent"
              >
                <GithubIcon className="h-5 w-5" />
                View on GitHub
              </a>
            )}
          </section>
        )}
      </div>
    </article>
  )
}
