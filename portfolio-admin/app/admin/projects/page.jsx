'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { projectSchema } from '@/lib/validation'
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
import { Edit2, Trash2, Plus, ArrowUp, ArrowDown, Palette, FileText } from 'lucide-react'

export default function ProjectsPage() {
  const { showToast } = useToast()
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null })
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Case-study sub-form. Kept separate from the project form because it posts
  // to its own endpoint (/admin/projects/{id}/case-study) and only applies to a
  // project that already exists.
  const [caseStudyFor, setCaseStudyFor] = useState(null)
  const [caseStudy, setCaseStudy] = useState(null)
  const [isSavingCaseStudy, setIsSavingCaseStudy] = useState(false)
  const [isUploadingDocument, setIsUploadingDocument] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: { title: '', description: '', image_path: '', image_alt: '', tags: '', github_url: '', live_url: '', is_featured: false, order: 0 },
  })

  const imagePath = watch('image_path')
  const imageAlt = watch('image_alt')

  const loadProjects = useCallback(async () => {
    setIsLoading(true)
    const result = await apiCall('GET', '/admin/projects')
    if (result.success) {
      setProjects(Array.isArray(result.data) ? result.data : [])
      setLoadError(false)
    } else {
      setLoadError(true)
      showToast(result.message || 'Failed to load projects', 'error')
    }
    setIsLoading(false)
  }, [showToast])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const onSubmit = async (data) => {
    setIsSaving(true)
    const formData = {
      ...data,
      tags:
        typeof data.tags === 'string'
          ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : data.tags || [],
      // The backend validates these with `url`, which rejects "". Send null for
      // a cleared field so it stores as absent rather than failing validation.
      github_url: data.github_url?.trim() || null,
      live_url: data.live_url?.trim() || null,
    }

    let result
    if (editingId) {
      result = await apiCall('PUT', `/admin/projects/${editingId}`, formData)
    } else {
      result = await apiCall('POST', '/admin/projects', formData)
    }
    setIsSaving(false)

    if (result.success) {
      showToast(editingId ? 'Project updated' : 'Project created', 'success')
      setEditingId(null)
      setShowForm(false)
      reset()
      await loadProjects()
    } else {
      showToast(result.message || 'Failed to save', 'error')
    }
  }

  const handleDelete = async (id) => {
    const result = await apiCall('DELETE', `/admin/projects/${id}`)
    if (result.success) {
      showToast('Project deleted', 'success')
      await loadProjects()
    } else {
      showToast(result.message || 'Failed to delete', 'error')
    }
    setDeleteDialog({ open: false, id: null })
  }

  const handleEdit = (project) => {
    // tags arrives from the API as an array but the field is a text input.
    reset({
      ...project,
      title: project.title || '',
      description: project.description || '',
      image_path: project.image_path || '',
      image_alt: project.image_alt || '',
      tags: Array.isArray(project.tags) ? project.tags.join(', ') : project.tags || '',
      github_url: project.github_url || '',
      live_url: project.live_url || '',
      is_featured: Boolean(project.is_featured),
      order: project.order ?? 0,
    })
    setEditingId(project.id)
    setShowForm(true)
  }

  /**
   * Open the case-study panel for a project, seeded from the `detail` the list
   * endpoint already eager-loads — no extra request needed.
   */
  const openCaseStudy = (project) => {
    const detail = project.detail ?? {}
    setCaseStudy({
      client: detail.client || '',
      date_range: detail.date_range || '',
      challenge: detail.challenge || '',
      solution: detail.solution || '',
      // Both list fields are edited as newline-separated text.
      results: Array.isArray(detail.results) ? detail.results.join('\n') : '',
      gallery_images: Array.isArray(detail.gallery_images)
        ? detail.gallery_images.join('\n')
        : '',
      document_path: detail.document_path || '',
    })
    setCaseStudyFor(project)
    setShowForm(false)
  }

  const saveCaseStudy = async (e) => {
    e.preventDefault()
    if (!caseStudyFor) return

    setIsSavingCaseStudy(true)
    const payload = {
      client: caseStudy.client?.trim() || null,
      date_range: caseStudy.date_range?.trim() || null,
      challenge: caseStudy.challenge?.trim() || null,
      solution: caseStudy.solution?.trim() || null,
      results: (caseStudy.results || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      gallery_images: (caseStudy.gallery_images || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      document_path: caseStudy.document_path?.trim() || null,
    }

    const result = await apiCall(
      'POST',
      `/admin/projects/${caseStudyFor.id}/case-study`,
      payload,
    )
    setIsSavingCaseStudy(false)

    if (result.success) {
      showToast('Case study saved', 'success')
      setCaseStudyFor(null)
      setCaseStudy(null)
      await loadProjects()
    } else {
      showToast(result.message || 'Failed to save case study', 'error')
    }
  }

  const handleReorder = async (id, direction) => {
    const idx = projects.findIndex((p) => p.id === id)
    if (idx === -1) return

    let newProjects = [...projects]
    if (direction === 'up' && idx > 0) {
      [newProjects[idx], newProjects[idx - 1]] = [newProjects[idx - 1], newProjects[idx]]
    } else if (direction === 'down' && idx < newProjects.length - 1) {
      [newProjects[idx], newProjects[idx + 1]] = [newProjects[idx + 1], newProjects[idx]]
    }

    const reorderData = newProjects.map((p, i) => ({ id: p.id, order: i }))
    const result = await apiCall('PUT', '/admin/projects/reorder', { items: reorderData })

    if (result.success) {
      setProjects(newProjects)
      showToast('Order updated', 'success')
    } else {
      showToast(result.message || 'Failed to update order', 'error')
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-2">Manage your portfolio projects</p>
        </div>
        <Button onClick={() => {
          setEditingId(null)
          reset()
          setShowForm(!showForm)
        }}>
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          Add Project
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Project' : 'Add Project'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="project-title" className="block text-sm font-medium mb-1">Title</label>
                <Input id="project-title" {...register('title')} placeholder="Project title" />
                {errors.title && <p className="text-destructive text-sm mt-1">{errors.title.message}</p>}
              </div>

              <div>
                <label htmlFor="project-description" className="block text-sm font-medium mb-1">Description</label>
                <Textarea id="project-description" {...register('description')} placeholder="Project description" rows={4} />
                {errors.description && <p className="text-destructive text-sm mt-1">{errors.description.message}</p>}
              </div>

              <div>
                <label htmlFor="project-tags" className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
                <Input id="project-tags" {...register('tags')} placeholder="Laravel, Vue.js, MySQL" />
                <p className="text-xs text-muted-foreground mt-1">
                  Rendered as the tag list on the project card.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="project-github-url" className="block text-sm font-medium mb-1">
                    GitHub URL
                  </label>
                  <Input
                    id="project-github-url"
                    {...register('github_url')}
                    placeholder="https://github.com/user/repo"
                  />
                  {errors.github_url && <p className="text-destructive text-sm mt-1">{errors.github_url.message}</p>}
                </div>

                <div>
                  <label htmlFor="project-live-url" className="block text-sm font-medium mb-1">
                    Live Site URL
                  </label>
                  <Input
                    id="project-live-url"
                    {...register('live_url')}
                    placeholder="https://example.com"
                  />
                  {errors.live_url && <p className="text-destructive text-sm mt-1">{errors.live_url.message}</p>}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" {...register('is_featured')} id="featured" className="w-4 h-4" />
                <label htmlFor="featured" className="text-sm font-medium cursor-pointer">Featured Project</label>
              </div>

              <FileUpload
                label="Project Image"
                accept="image/*"
                onUploadComplete={(url) => setValue('image_path', url || '')}
                initialValue={imagePath}
                onUploadingChange={setIsUploading}
                altText={imageAlt || ''}
                onAltTextChange={(value) => setValue('image_alt', value)}
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

      {caseStudyFor && caseStudy && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Case Study — {caseStudyFor.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveCaseStudy} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cs-client" className="block text-sm font-medium mb-1">Client</label>
                  <Input
                    id="cs-client"
                    value={caseStudy.client}
                    onChange={(e) => setCaseStudy({ ...caseStudy, client: e.target.value })}
                    placeholder="Client or employer"
                  />
                </div>
                <div>
                  <label htmlFor="cs-date-range" className="block text-sm font-medium mb-1">Timeline</label>
                  <Input
                    id="cs-date-range"
                    value={caseStudy.date_range}
                    onChange={(e) => setCaseStudy({ ...caseStudy, date_range: e.target.value })}
                    placeholder="Jan 2025 — Mar 2025"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cs-challenge" className="block text-sm font-medium mb-1">Challenge</label>
                <Textarea
                  id="cs-challenge"
                  value={caseStudy.challenge}
                  onChange={(e) => setCaseStudy({ ...caseStudy, challenge: e.target.value })}
                  rows={4}
                  placeholder="What problem did this project solve?"
                />
              </div>

              <div>
                <label htmlFor="cs-solution" className="block text-sm font-medium mb-1">Solution</label>
                <Textarea
                  id="cs-solution"
                  value={caseStudy.solution}
                  onChange={(e) => setCaseStudy({ ...caseStudy, solution: e.target.value })}
                  rows={4}
                  placeholder="How was it built?"
                />
              </div>

              <div>
                <label htmlFor="cs-results" className="block text-sm font-medium mb-1">
                  Results <span className="text-muted-foreground font-normal">(one per line)</span>
                </label>
                <Textarea
                  id="cs-results"
                  value={caseStudy.results}
                  onChange={(e) => setCaseStudy({ ...caseStudy, results: e.target.value })}
                  rows={4}
                  placeholder={'40% faster page loads\nReduced support tickets by half'}
                />
              </div>

              <div>
                <label htmlFor="cs-gallery" className="block text-sm font-medium mb-1">
                  Gallery image URLs <span className="text-muted-foreground font-normal">(one per line)</span>
                </label>
                <Textarea
                  id="cs-gallery"
                  value={caseStudy.gallery_images}
                  onChange={(e) => setCaseStudy({ ...caseStudy, gallery_images: e.target.value })}
                  rows={3}
                  placeholder="https://.../screenshot-1.png"
                />
              </div>

              {/* Shown in the Document section of the public details page. */}
              <FileUpload
                label="Document (PDF, spec, or write-up)"
                accept=".pdf,.doc,.docx,application/pdf"
                maxSize={10 * 1024 * 1024}
                showAltText={false}
                onUploadComplete={(url) =>
                  setCaseStudy((current) => ({ ...current, document_path: url || '' }))
                }
                initialValue={caseStudy.document_path || null}
                onUploadingChange={setIsUploadingDocument}
              />

              <div className="flex gap-2">
                <Button type="submit" disabled={isUploadingDocument || isSavingCaseStudy}>
                  {isUploadingDocument
                    ? 'Waiting for upload...'
                    : isSavingCaseStudy
                      ? 'Saving...'
                      : 'Save Case Study'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCaseStudyFor(null)
                    setCaseStudy(null)
                  }}
                >
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
              title="Couldn't load projects"
              description="Something went wrong fetching your projects. Check your connection and try again."
            />
          ) : projects.length === 0 ? (
            <EmptyState
              type="add"
              icon={Palette}
              title="No Projects Yet"
              description="Add your first project to showcase it in your portfolio"
            />
          ) : (
            <div className="space-y-2">
              {projects.map((project, idx) => (
                <div key={project.id} className="p-4 border border-border rounded-lg hover:bg-muted/50 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{project.title}</span>
                      {project.is_featured && <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">Featured</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {project.description
                        ? `${project.description.substring(0, 100)}${project.description.length > 100 ? '...' : ''}`
                        : 'No description'}
                    </p>
                  </div>

                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Move ${project.title} up`} onClick={() => handleReorder(project.id, 'up')} disabled={idx === 0}>
                      <ArrowUp className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Move ${project.title} down`} onClick={() => handleReorder(project.id, 'down')} disabled={idx === projects.length - 1}>
                      <ArrowDown className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Edit ${project.title}`} onClick={() => handleEdit(project)}>
                      <Edit2 className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit case study for ${project.title}`}
                      title="Case study & document"
                      onClick={() => openCaseStudy(project)}
                    >
                      <FileText className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${project.title}`} onClick={() => setDeleteDialog({ open: true, id: project.id })}>
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
        title="Delete Project"
        description="This action cannot be undone. The project will be permanently deleted."
        confirmText="Delete"
        pendingText="Deleting..."
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => handleDelete(deleteDialog.id)}
      />
    </div>
  )
}
