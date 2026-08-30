'use client'

import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { aboutSchema } from '@/lib/validation'
import { apiCall } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { FileUpload } from '@/components/admin/FileUpload'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'

export default function AboutPage() {
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    control,
  } = useForm({
    resolver: zodResolver(aboutSchema),
    defaultValues: {
      bio_paragraph_1: '',
      bio_paragraph_2: '',
      image_path: '',
      image_alt: '',
      stats: [
        { label: '', value: '' },
        { label: '', value: '' },
        { label: '', value: '' },
        { label: '', value: '' },
      ],
    },
  })

  const { fields: statsFields, append: appendStat, remove: removeStat } = useFieldArray({
    control,
    name: 'stats',
  })

  const imagePath = watch('image_path')
  const imageAlt = watch('image_alt')

  useEffect(() => {
    const loadAbout = async () => {
      const result = await apiCall('GET', '/admin/about')
      // A brand-new site has no about row yet, so data can legitimately be null.
      if (result.success && result.data && typeof result.data === 'object') {
        const about = result.data
        setValue('bio_paragraph_1', about.bio_paragraph_1 || '')
        setValue('bio_paragraph_2', about.bio_paragraph_2 || '')
        setValue('image_path', about.image_path || '')
        setValue('image_alt', about.image_alt || '')
        if (Array.isArray(about.stats) && about.stats.length > 0) {
          setValue(
            'stats',
            about.stats.map((stat) => ({
              label: stat?.label || '',
              value: stat?.value || '',
            }))
          )
        }
      } else if (!result.success) {
        showToast(result.message || 'Failed to load about section', 'error')
      }
      setIsLoading(false)
    }

    loadAbout()
  }, [setValue, showToast])

  const onSubmit = async (data) => {
    setIsSaving(true)
    // Blank stat rows are placeholders in the UI, not data worth persisting.
    const payload = {
      ...data,
      stats: (data.stats || []).filter(
        (stat) => (stat.label || '').trim() && (stat.value || '').trim()
      ),
    }
    const result = await apiCall('PUT', '/admin/about', payload)

    if (result.success) {
      showToast('About section updated', 'success')
    } else {
      showToast(result.message || 'Failed to save', 'error')
    }
    setIsSaving(false)
  }

  const handleReset = async () => {
    const result = await apiCall('POST', '/admin/about/reset')

    if (result.success && result.data) {
      const about = result.data
      setValue('bio_paragraph_1', about.bio_paragraph_1 || '')
      setValue('bio_paragraph_2', about.bio_paragraph_2 || '')
      setValue('image_path', about.image_path || '')
      setValue('image_alt', about.image_alt || '')
      // Reset clears `stats` to []. Rendering zero rows would leave the admin
      // with no way to add one back except the "Add Stat" button, so restore
      // the same blank placeholder rows a fresh site starts with.
      setValue(
        'stats',
        Array.isArray(about.stats) && about.stats.length > 0
          ? about.stats.map((stat) => ({
              label: stat?.label || '',
              value: stat?.value || '',
            }))
          : [
              { label: '', value: '' },
              { label: '', value: '' },
              { label: '', value: '' },
              { label: '', value: '' },
            ]
      )
      showToast('About section reset successfully', 'success')
    } else {
      showToast(result.message || 'Failed to reset about section', 'error')
    }
    setResetDialogOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading about section…</span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">About Section</h1>
        <p className="text-muted-foreground mt-2">Edit your about page content</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label htmlFor="about-bio-1" className="block text-sm font-medium mb-2">Bio Paragraph 1</label>
              <Textarea
                id="about-bio-1"
                {...register('bio_paragraph_1')}
                placeholder="Your bio content..."
                disabled={isSaving}
                rows={4}
              />
              {errors.bio_paragraph_1 && (
                <p className="text-destructive text-sm mt-1">{errors.bio_paragraph_1.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="about-bio-2" className="block text-sm font-medium mb-2">Bio Paragraph 2</label>
              <Textarea
                id="about-bio-2"
                {...register('bio_paragraph_2')}
                placeholder="Additional bio content..."
                disabled={isSaving}
                rows={4}
              />
            </div>

            <div className="border-t border-border pt-6">
              <FileUpload
                label="About Image"
                accept="image/*"
                onUploadComplete={(url) => setValue('image_path', url || '')}
                initialValue={imagePath}
                onUploadingChange={setIsUploading}
                altText={imageAlt || ''}
                onAltTextChange={(value) => setValue('image_alt', value)}
              />
            </div>

            <div className="border-t border-border pt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Statistics</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendStat({ label: '', value: '' })}
                >
                  <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                  Add Stat
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Rows left blank are ignored when saving.
              </p>

              <div className="space-y-3">
                {statsFields.map((field, index) => (
                  <div key={field.id} className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label htmlFor={`stat-label-${index}`} className="sr-only">
                        Statistic {index + 1} label
                      </label>
                      <Input
                        id={`stat-label-${index}`}
                        {...register(`stats.${index}.label`)}
                        placeholder="Label (e.g., 'Projects')"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor={`stat-value-${index}`} className="sr-only">
                        Statistic {index + 1} value
                      </label>
                      <Input
                        id={`stat-value-${index}`}
                        {...register(`stats.${index}.value`)}
                        placeholder="Value (e.g., '50')"
                        disabled={isSaving}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove statistic ${index + 1}`}
                      onClick={() => removeStat(index)}
                      disabled={statsFields.length === 1}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-between pt-6 border-t border-border">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setResetDialogOpen(true)}
                disabled={isSaving || isUploading}
              >
                <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
                Reset All Fields
              </Button>

              <Button type="submit" disabled={isSaving || isUploading}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                    Saving...
                  </>
                ) : isUploading ? (
                  'Waiting for upload...'
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset About Section"
        description="This will clear all fields in the About Section, including every statistic. The uploaded image will be deleted. This cannot be undone. Continue?"
        onConfirm={handleReset}
        confirmText="Reset"
        cancelText="Cancel"
        isDestructive={true}
        pendingText="Resetting..."
      />
    </div>
  )
}
