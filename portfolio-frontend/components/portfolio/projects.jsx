'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowUpRight, ExternalLink, FolderGit2 } from 'lucide-react'
import { SectionHeading } from './reveal'
import { GithubIcon } from './social-icons'

/**
 * Project grid.
 *
 * A card is image + tags + repo icon + live link + title, and the title is the
 * link into the details page. The description is deliberately absent — it is
 * part of the details page now, and GET /api/projects no longer returns it.
 *
 * Every project gets a details route, whether or not a case study has been
 * written: the page still has the description, document and links to show.
 */
export function Projects({ projects = [], hero = {} }) {
  const items = Array.isArray(projects) ? projects : []
  const githubProfile = hero.github_url

  return (
    <section id="projects" className="relative py-12 md:py-16">
      <div
        aria-hidden
        className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl sm:blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="Selected Work" title="Featured Projects" />

        {items.length === 0 ? (
          <p className="text-center text-muted-foreground">
            Projects are being added. Check back soon.
          </p>
        ) : (
          // Three columns on desktop for a denser grid; the cards themselves
          // are compact enough that a wider one would look sparse.
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((project, i) => {
              const tags = Array.isArray(project.tags) ? project.tags : []

              return (
                <motion.article
                  key={project.id ?? project.slug}
                  data-project-card
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="group relative flex flex-col overflow-hidden rounded-xl border-l-2 border-l-transparent bg-card backdrop-blur-xl transition-all duration-300 hover:-translate-y-1.5 hover:border-l-primary hover:glow-primary"
                  style={{ backdropFilter: 'blur(20px)' }}
                >
                  {/* 7/3 on a third-of-row card puts the preview at ~150px,
                      about half the 303px it was when cards were half-width.
                      An aspect ratio rather than a fixed height so the preview
                      keeps its proportions in the 1- and 2-column layouts. */}
                  <Link
                    href={`/projects/${project.slug}`}
                    aria-label={`${project.title} details`}
                    className="relative block aspect-[7/3] w-full overflow-hidden bg-gradient-to-tr from-primary/70 to-accent/70"
                  >
                    {project.image_path ? (
                      <Image
                        src={project.image_path}
                        alt={project.image_alt || project.title}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-primary-foreground">
                        <FolderGit2 className="h-7 w-7" aria-hidden="true" />
                      </span>
                    )}
                  </Link>

                  <div className="flex flex-1 flex-col p-3">
                    <h3 className="font-heading text-sm font-bold text-foreground">
                      <Link
                        href={`/projects/${project.slug}`}
                        className="inline-flex items-center gap-1 transition-colors hover:text-accent"
                      >
                        {project.title}
                        <ArrowUpRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </Link>
                    </h3>

                    {tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            data-project-tag
                            className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium leading-tight text-accent"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Tap targets stay at 36px (h-9) despite the smaller card —
                        shrinking them is what would break touch usability. */}
                    <div className="mt-auto flex min-h-9 items-center gap-2 pt-2">
                      {project.github_url && (
                        <a
                          href={project.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-project-git
                          aria-label={`${project.title} GitHub repository`}
                          title="View repository"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                        >
                          <GithubIcon className="h-4 w-4" />
                        </a>
                      )}
                      {project.live_url && (
                        <a
                          href={project.live_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-project-live
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground"
                        >
                          Live Site
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.article>
              )
            })}
          </div>
        )}

        {githubProfile && (
          <div className="mt-12 flex justify-center">
            <a
              href={githubProfile}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-6 py-3 font-semibold text-foreground transition-all duration-300 hover:border-accent hover:bg-secondary/80"
              title="View all projects on GitHub"
            >
              View All Projects
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
