'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { contactInfoSchema } from '@/lib/validation'
import { apiCall } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Loader2, RotateCcw } from 'lucide-react'

const CONTACT_FIELDS = ['email', 'phone', 'location', 'calendly_link']

export default function ContactInfoPage() {
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm({
    resolver: zodResolver(contactInfoSchema),
    defaultValues: {
      email: '',
      phone: '',
      location: '',
      calendly_link: '',
    },
  })

  useEffect(() => {
    const loadContactInfo = async () => {
      const result = await apiCall('GET', '/admin/contact-info')
      // A brand-new site has no contact row yet, so data can legitimately be null.
      if (result.success && result.data && typeof result.data === 'object') {
        CONTACT_FIELDS.forEach((key) => {
          setValue(key, result.data[key] ?? '')
        })
      } else if (!result.success) {
        showToast(result.message || 'Failed to load contact info', 'error')
      }
      setIsLoading(false)
    }

    loadContactInfo()
  }, [setValue, showToast])

  const onSubmit = async (data) => {
    setIsSaving(true)
    const result = await apiCall('PUT', '/admin/contact-info', data)

    if (result.success) {
      showToast('Contact info updated', 'success')
    } else {
      showToast(result.message || 'Failed to save', 'error')
    }
    setIsSaving(false)
  }

  const handleReset = async () => {
    const result = await apiCall('POST', '/admin/contact-info/reset')

    if (result.success && result.data) {
      CONTACT_FIELDS.forEach((key) => {
        setValue(key, result.data[key] ?? '')
      })
      showToast('Contact info reset successfully', 'success')
    } else {
      showToast(result.message || 'Failed to reset contact info', 'error')
    }
    setResetDialogOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading contact info…</span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Contact Information</h1>
        <p className="text-muted-foreground mt-2">Update your contact details</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-md">
            <div>
              <label htmlFor="contact-email" className="block text-sm font-medium mb-2">Email</label>
              <Input
                id="contact-email"
                {...register('email')}
                type="email"
                placeholder="hello@example.com"
                disabled={isSaving}
              />
              {errors.email && <p className="text-destructive text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="contact-phone" className="block text-sm font-medium mb-2">Phone</label>
              <Input
                id="contact-phone"
                {...register('phone')}
                type="tel"
                placeholder="+1 (555) 123-4567"
                disabled={isSaving}
              />
            </div>

            <div>
              <label htmlFor="contact-location" className="block text-sm font-medium mb-2">Location</label>
              <Input
                id="contact-location"
                {...register('location')}
                placeholder="City, Country"
                disabled={isSaving}
              />
            </div>

            <div>
              <label htmlFor="contact-calendly" className="block text-sm font-medium mb-2">Calendly Link</label>
              <Input
                id="contact-calendly"
                {...register('calendly_link')}
                type="url"
                placeholder="https://calendly.com/yourname"
                disabled={isSaving}
              />
              {errors.calendly_link && <p className="text-destructive text-sm mt-1">{errors.calendly_link.message}</p>}
            </div>

            <div className="flex gap-3 justify-between pt-6 border-t border-border">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setResetDialogOpen(true)}
                disabled={isSaving}
              >
                <RotateCcw className="w-4 h-4 mr-2" aria-hidden="true" />
                Reset All Fields
              </Button>

              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                    Saving...
                  </>
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
        title="Reset Contact Information"
        description="This will clear all fields in Contact Information. This cannot be undone. Continue?"
        onConfirm={handleReset}
        confirmText="Reset"
        cancelText="Cancel"
        isDestructive={true}
        pendingText="Resetting..."
      />
    </div>
  )
}
