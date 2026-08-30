'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { testimonialSchema } from '@/lib/validation'
import { apiCall } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { FileUpload } from '@/components/admin/FileUpload'
import { EmptyState } from '@/components/admin/EmptyState'
import { ListSkeleton } from '@/components/admin/Skeleton'
import { Edit2, Trash2, Plus, ArrowUp, ArrowDown, MessageSquare } from 'lucide-react'

export default function TestimonialsPage() {
  const { showToast } = useToast()
  const [testimonials, setTestimonials] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null })
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(testimonialSchema),
    defaultValues: { quote: '', author_name: '', author_role: '', avatar_path: '', avatar_alt: '', order: 0 },
  })

  const avatarPath = watch('avatar_path')
  const avatarAlt = watch('avatar_alt')

  const loadTestimonials = useCallback(async () => {
    setIsLoading(true)
    const result = await apiCall('GET', '/admin/testimonials')
    if (result.success) {
      setTestimonials(Array.isArray(result.data) ? result.data : [])
      setLoadError(false)
    } else {
      setLoadError(true)
      showToast(result.message || 'Failed to load testimonials', 'error')
    }
    setIsLoading(false)
  }, [showToast])

  useEffect(() => {
    loadTestimonials()
  }, [loadTestimonials])

  const onSubmit = async (data) => {
    setIsSaving(true)
    let result
    if (editingId) {
      result = await apiCall('PUT', `/admin/testimonials/${editingId}`, data)
    } else {
      result = await apiCall('POST', '/admin/testimonials', data)
    }
    setIsSaving(false)

    if (result.success) {
      showToast(editingId ? 'Testimonial updated' : 'Testimonial created', 'success')
      setEditingId(null)
      setShowForm(false)
      reset()
      await loadTestimonials()
    } else {
      showToast(result.message || 'Failed to save', 'error')
    }
  }

  const handleDelete = async (id) => {
    const result = await apiCall('DELETE', `/admin/testimonials/${id}`)
    if (result.success) {
      showToast('Testimonial deleted', 'success')
      await loadTestimonials()
    } else {
      showToast(result.message || 'Failed to delete', 'error')
    }
    setDeleteDialog({ open: false, id: null })
  }

  const handleEdit = (testimonial) => {
    reset({
      quote: testimonial.quote || '',
      author_name: testimonial.author_name || '',
      author_role: testimonial.author_role || '',
      avatar_path: testimonial.avatar_path || '',
      avatar_alt: testimonial.avatar_alt || '',
      order: testimonial.order ?? 0,
    })
    setEditingId(testimonial.id)
    setShowForm(true)
  }

  const handleReorder = async (id, direction) => {
    const idx = testimonials.findIndex((t) => t.id === id)
    if (idx === -1) return

    let newTestimonials = [...testimonials]
    if (direction === 'up' && idx > 0) {
      [newTestimonials[idx], newTestimonials[idx - 1]] = [newTestimonials[idx - 1], newTestimonials[idx]]
    } else if (direction === 'down' && idx < newTestimonials.length - 1) {
      [newTestimonials[idx], newTestimonials[idx + 1]] = [newTestimonials[idx + 1], newTestimonials[idx]]
    }

    const reorderData = newTestimonials.map((t, i) => ({ id: t.id, order: i }))
    const result = await apiCall('PUT', '/admin/testimonials/reorder', { items: reorderData })

    if (result.success) {
      setTestimonials(newTestimonials)
      showToast('Order updated', 'success')
    } else {
      showToast(result.message || 'Failed to update order', 'error')
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Testimonials</h1>
          <p className="text-muted-foreground mt-2">Manage client testimonials</p>
        </div>
        <Button onClick={() => {
          setEditingId(null)
          reset()
          setShowForm(!showForm)
        }}>
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          Add Testimonial
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Testimonial' : 'Add Testimonial'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="testimonial-quote" className="block text-sm font-medium mb-1">Quote</label>
                <Textarea id="testimonial-quote" {...register('quote')} placeholder="What did your client say?" rows={4} />
                {errors.quote && <p className="text-destructive text-sm mt-1">{errors.quote.message}</p>}
              </div>

              <div>
                <label htmlFor="testimonial-author" className="block text-sm font-medium mb-1">Author Name</label>
                <Input id="testimonial-author" {...register('author_name')} placeholder="John Doe" />
                {errors.author_name && <p className="text-destructive text-sm mt-1">{errors.author_name.message}</p>}
              </div>

              <div>
                <label htmlFor="testimonial-role" className="block text-sm font-medium mb-1">Author Role</label>
                <Input id="testimonial-role" {...register('author_role')} placeholder="CEO at Company" />
              </div>

              <FileUpload
                label="Avatar"
                accept="image/*"
                maxSize={2 * 1024 * 1024}
                onUploadComplete={(url) => setValue('avatar_path', url || '')}
                initialValue={avatarPath}
                onUploadingChange={setIsUploading}
                altText={avatarAlt || ''}
                onAltTextChange={(value) => setValue('avatar_alt', value)}
              />

              <div className="flex gap-2">
                <Button type="submit" disabled={isUploading || isSaving}>
                  {isUploading ? 'Waiting for upload...' : isSaving ? 'Saving...' : editingId ? 'Update' : 'Create'}
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
            <ListSkeleton rows={3} withAvatar />
          ) : loadError ? (
            <EmptyState
              type="items"
              title="Couldn't load testimonials"
              description="Something went wrong fetching your testimonials. Check your connection and try again."
            />
          ) : testimonials.length === 0 ? (
            <EmptyState
              type="add"
              icon={MessageSquare}
              title="No Testimonials Yet"
              description="Add your first client testimonial to build social proof"
            />
          ) : (
            <div className="space-y-2">
              {testimonials.map((testimonial, idx) => (
                <div key={testimonial.id} className="p-4 border border-border rounded-lg hover:bg-muted/50">
                  <div className="flex items-start gap-3">
                    {testimonial.avatar_path && (
                      <img
                        src={testimonial.avatar_path}
                        alt={testimonial.avatar_alt || testimonial.author_name || ''}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="italic text-sm mb-2">
                        &quot;{testimonial.quote
                          ? `${testimonial.quote.substring(0, 100)}${testimonial.quote.length > 100 ? '...' : ''}`
                          : ''}&quot;
                      </p>
                      <p className="font-medium text-sm">{testimonial.author_name}</p>
                      <p className="text-xs text-muted-foreground">{testimonial.author_role}</p>
                    </div>

                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Move testimonial from ${testimonial.author_name} up`} onClick={() => handleReorder(testimonial.id, 'up')} disabled={idx === 0}>
                        <ArrowUp className="w-4 h-4" aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Move testimonial from ${testimonial.author_name} down`} onClick={() => handleReorder(testimonial.id, 'down')} disabled={idx === testimonials.length - 1}>
                        <ArrowDown className="w-4 h-4" aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Edit testimonial from ${testimonial.author_name}`} onClick={() => handleEdit(testimonial)}>
                        <Edit2 className="w-4 h-4" aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete testimonial from ${testimonial.author_name}`} onClick={() => setDeleteDialog({ open: true, id: testimonial.id })}>
                        <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                      </Button>
                    </div>
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
        title="Delete Testimonial"
        description="This action cannot be undone. The testimonial will be permanently deleted."
        confirmText="Delete"
        pendingText="Deleting..."
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => handleDelete(deleteDialog.id)}
      />
    </div>
  )
}
