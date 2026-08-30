'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiCall } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/admin/EmptyState'
import { ListSkeleton } from '@/components/admin/Skeleton'
import { ArrowUp, ArrowDown, Layers, Lock } from 'lucide-react'

/**
 * Section visibility and ordering.
 *
 * This replaced the old Navigation Items page. Nav links are no longer managed
 * by hand: every row here is both a homepage section and its nav link, so
 * hiding a section removes its link in the same action and the two can never
 * disagree.
 *
 * Saves immediately on toggle or reorder, matching the other reorderable admin
 * lists (Skills, Timeline, Projects) — there is no separate Save step.
 */
export default function SectionsPage() {
  const { showToast } = useToast()
  const [sections, setSections] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const loadSections = useCallback(async () => {
    setIsLoading(true)
    const result = await apiCall('GET', '/admin/section-visibility')
    if (result.success) {
      setSections(Array.isArray(result.data) ? result.data : [])
      setLoadError(false)
    } else {
      setLoadError(true)
      showToast(result.message || 'Failed to load sections', 'error')
    }
    setIsLoading(false)
  }, [showToast])

  useEffect(() => {
    loadSections()
  }, [loadSections])

  /**
   * Post the whole list and adopt the server's response as the new state.
   *
   * The UI updates optimistically so a toggle feels instant, but `previous` is
   * kept so a failed request can roll back — leaving a switch showing "hidden"
   * when the section is still live would be worse than not moving at all.
   */
  const persist = async (nextSections, successMessage) => {
    const previous = sections

    setSections(nextSections)
    setIsSaving(true)

    const result = await apiCall('PUT', '/admin/section-visibility', {
      sections: nextSections.map((section, index) => ({
        id: section.id,
        is_visible: section.is_visible,
        order: index,
      })),
    })

    setIsSaving(false)

    if (result.success) {
      if (Array.isArray(result.data)) setSections(result.data)
      showToast(successMessage, 'success')
    } else {
      setSections(previous)
      showToast(result.message || 'Failed to update sections', 'error')
    }
  }

  const handleToggle = (section) => {
    if (!section.is_toggleable) return

    const next = sections.map((item) =>
      item.id === section.id ? { ...item, is_visible: !item.is_visible } : item,
    )

    persist(
      next,
      `${section.label} is now ${section.is_visible ? 'hidden' : 'visible'}`,
    )
  }

  const handleReorder = (id, direction) => {
    const index = sections.findIndex((section) => section.id === id)
    if (index === -1) return

    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= sections.length) return

    const next = [...sections]
    ;[next[index], next[target]] = [next[target], next[index]]

    persist(next, 'Order updated')
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Sections</h1>
        <p className="text-muted-foreground mt-2">
          Choose which sections appear on your site and in what order. Hiding a
          section also removes its link from the navigation bar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Homepage Sections</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListSkeleton rows={6} />
          ) : loadError ? (
            <EmptyState
              type="items"
              title="Couldn't load sections"
              description="Something went wrong fetching your sections. Check your connection and try again."
            />
          ) : sections.length === 0 ? (
            <EmptyState
              type="items"
              icon={Layers}
              title="No Sections Found"
              description="Sections are created automatically. Try re-running the database seeder."
            />
          ) : (
            <div className="space-y-2">
              {sections.map((section, index) => (
                <div
                  key={section.id}
                  className="flex items-center gap-3 p-4 border border-border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium flex items-center gap-2">
                      {section.label}
                      {!section.is_toggleable && (
                        <Lock
                          className="w-3 h-3 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground break-all">
                      {section.nav_href}
                      {!section.is_toggleable && (
                        <span className="ml-2">
                          — always visible, a portfolio needs its intro
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Native checkbox styled as a switch: it is focusable and
                      announces its own checked state, so the toggle stays
                      keyboard- and screen-reader-accessible without ARIA. */}
                  <label className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-muted-foreground w-14 text-right">
                      {section.is_visible ? 'Visible' : 'Hidden'}
                    </span>
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={section.is_visible}
                      disabled={!section.is_toggleable || isSaving}
                      onChange={() => handleToggle(section)}
                      aria-label={`${section.is_visible ? 'Hide' : 'Show'} the ${section.label} section`}
                    />
                    <span
                      aria-hidden="true"
                      className={`relative h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${
                        section.is_visible ? 'bg-primary' : 'bg-muted-foreground/40'
                      } ${
                        section.is_toggleable
                          ? 'cursor-pointer'
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-background transition-transform ${
                          section.is_visible ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </span>
                  </label>

                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move ${section.label} up`}
                      onClick={() => handleReorder(section.id, 'up')}
                      disabled={index === 0 || isSaving}
                    >
                      <ArrowUp className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move ${section.label} down`}
                      onClick={() => handleReorder(section.id, 'down')}
                      disabled={index === sections.length - 1 || isSaving}
                    >
                      <ArrowDown className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
