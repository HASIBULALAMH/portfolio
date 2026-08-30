'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { timelineItemSchema } from '@/lib/validation'
import { apiCall } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/admin/EmptyState'
import { ListSkeleton } from '@/components/admin/Skeleton'
import { Edit2, Trash2, Plus, ArrowUp, ArrowDown, Clock } from 'lucide-react'

export default function TimelinePage() {
  const { showToast } = useToast()
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(timelineItemSchema),
    defaultValues: {
      type: 'experience',
      institute_or_company: '',
      subject_or_role: '',
      start_year: '',
      end_year: '',
      description: '',
      order: 0,
    },
  })

  // The two shared columns are relabeled rather than duplicated: one row in one
  // table backs both variants, so the public timeline renders identically for
  // either type and only the label text differs.
  const type = watch('type')
  const isEducation = type === 'education'
  const labels = isEducation
    ? { org: 'Institute', detail: 'Subject' }
    : { org: 'Company', detail: 'Role' }

  const loadItems = useCallback(async () => {
    setIsLoading(true)
    const result = await apiCall('GET', '/admin/timeline-items')
    if (result.success) {
      setItems(Array.isArray(result.data) ? result.data : [])
      setLoadError(false)
    } else {
      setLoadError(true)
      showToast(result.message || 'Failed to load timeline items', 'error')
    }
    setIsLoading(false)
  }, [showToast])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const onSubmit = async (data) => {
    let result
    if (editingId) {
      result = await apiCall('PUT', `/admin/timeline-items/${editingId}`, data)
    } else {
      result = await apiCall('POST', '/admin/timeline-items', { ...data, order: items.length })
    }

    if (result.success) {
      showToast(editingId ? 'Timeline updated' : 'Timeline item created', 'success')
      setEditingId(null)
      setShowForm(false)
      reset()
      await loadItems()
    } else {
      showToast(result.message || 'Failed to save', 'error')
    }
  }

  const handleDelete = async (id) => {
    const result = await apiCall('DELETE', `/admin/timeline-items/${id}`)
    if (result.success) {
      showToast('Item deleted', 'success')
      await loadItems()
    } else {
      showToast(result.message || 'Failed to delete', 'error')
    }
    setDeleteDialog({ open: false, id: null })
  }

  const handleEdit = (item) => {
    reset({
      type: item.type || 'experience',
      // Falls back to the legacy columns for rows created before the type
      // migration, which the API still returns alongside the new fields.
      institute_or_company: item.institute_or_company || item.company || '',
      subject_or_role: item.subject_or_role || item.title || '',
      start_year: item.start_year || '',
      end_year: item.end_year || '',
      description: item.description || '',
      order: item.order ?? 0,
    })
    setEditingId(item.id)
    setShowForm(true)
  }

  const handleReorder = async (id, direction) => {
    const idx = items.findIndex((i) => i.id === id)
    if (idx === -1) return

    let newItems = [...items]
    if (direction === 'up' && idx > 0) {
      [newItems[idx], newItems[idx - 1]] = [newItems[idx - 1], newItems[idx]]
    } else if (direction === 'down' && idx < newItems.length - 1) {
      [newItems[idx], newItems[idx + 1]] = [newItems[idx + 1], newItems[idx]]
    } else {
      return
    }

    const reorderData = newItems.map((item, i) => ({ id: item.id, order: i }))
    const result = await apiCall('PUT', '/admin/timeline-items/reorder', { items: reorderData })

    if (result.success) {
      setItems(newItems)
      showToast('Order updated', 'success')
    } else {
      showToast(result.message || 'Failed to update order', 'error')
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Timeline</h1>
          <p className="text-muted-foreground mt-2">Manage your experience timeline</p>
        </div>
        <Button onClick={() => {
          setEditingId(null)
          reset()
          setShowForm(!showForm)
        }}>
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          Add Item
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Timeline Item' : 'Add Timeline Item'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Type selector — drives the labels on the two shared fields
                  below. Nothing else about the entry changes. */}
              <fieldset>
                <legend className="block text-sm font-medium mb-2">Entry type</legend>
                <div className="flex gap-4">
                  <label htmlFor="timeline-type-experience" className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="timeline-type-experience"
                      type="radio"
                      value="experience"
                      {...register('type')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Experience</span>
                  </label>
                  <label htmlFor="timeline-type-education" className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="timeline-type-education"
                      type="radio"
                      value="education"
                      {...register('type')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Education</span>
                  </label>
                </div>
                {errors.type && <p className="text-destructive text-sm mt-1">{errors.type.message}</p>}
              </fieldset>

              <div>
                <label htmlFor="timeline-org" className="block text-sm font-medium mb-1">
                  {labels.org}
                </label>
                <Input
                  id="timeline-org"
                  {...register('institute_or_company')}
                  placeholder={isEducation ? 'Northern University Bangladesh' : 'Kodeeo Ltd.'}
                />
                {errors.institute_or_company && (
                  <p className="text-destructive text-sm mt-1">{errors.institute_or_company.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="timeline-detail" className="block text-sm font-medium mb-1">
                  {labels.detail}
                </label>
                <Input
                  id="timeline-detail"
                  {...register('subject_or_role')}
                  placeholder={isEducation ? 'BSc in Engineering' : 'Laravel Developer'}
                />
                {errors.subject_or_role && (
                  <p className="text-destructive text-sm mt-1">{errors.subject_or_role.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="timeline-start-year" className="block text-sm font-medium mb-1">
                    Start year
                  </label>
                  <Input id="timeline-start-year" {...register('start_year')} placeholder="2023" />
                  {errors.start_year && (
                    <p className="text-destructive text-sm mt-1">{errors.start_year.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="timeline-end-year" className="block text-sm font-medium mb-1">
                    End year <span className="text-muted-foreground font-normal">(blank = Present)</span>
                  </label>
                  <Input id="timeline-end-year" {...register('end_year')} placeholder="2025" />
                  {errors.end_year && (
                    <p className="text-destructive text-sm mt-1">{errors.end_year.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="timeline-description" className="block text-sm font-medium mb-1">Description</label>
                <Textarea
                  id="timeline-description"
                  {...register('description')}
                  placeholder={isEducation ? 'What you studied...' : 'What you worked on...'}
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </Button>
                <Button type="button" variant="outline" onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                  reset()
                }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : loadError ? (
            <EmptyState
              type="items"
              title="Couldn't load timeline"
              description="Something went wrong fetching your timeline. Check your connection and try again."
            />
          ) : items.length === 0 ? (
            <EmptyState
              type="add"
              icon={Clock}
              title="No Timeline Items Yet"
              description="Add your first role or milestone to build your experience timeline"
            />
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.id} className="p-4 border border-border rounded-lg hover:bg-muted/50 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded capitalize ${
                          item.type === 'education'
                            ? 'bg-primary/15 text-primary'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {item.type || 'experience'}
                      </span>
                      {item.year_range || item.year} — {item.subject_or_role || item.title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item.institute_or_company || item.company}
                    </div>
                    {item.description && <p className="text-sm mt-2">{item.description}</p>}
                  </div>

                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Move ${item.title} up`} onClick={() => handleReorder(item.id, 'up')} disabled={idx === 0}>
                      <ArrowUp className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Move ${item.title} down`} onClick={() => handleReorder(item.id, 'down')} disabled={idx === items.length - 1}>
                      <ArrowDown className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Edit ${item.title}`} onClick={() => handleEdit(item)}>
                      <Edit2 className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${item.title}`} onClick={() => setDeleteDialog({ open: true, id: item.id })}>
                      <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        title="Delete Timeline Item"
        description="This action cannot be undone. The timeline item will be permanently deleted."
        confirmText="Delete"
        pendingText="Deleting..."
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => handleDelete(deleteDialog.id)}
      />
    </div>
  )
}
