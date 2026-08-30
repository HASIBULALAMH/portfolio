<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectDetail;
use Illuminate\Support\Str;

class ProjectService
{
    /**
     * Create a project, deriving a unique slug from the title.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Project
    {
        $data['slug'] = $this->uniqueSlug(
            $data['slug'] ?? $data['title'],
        );

        return Project::query()->create($data);
    }

    /**
     * Update a project. The slug follows a renamed title so public URLs stay
     * meaningful, but an explicitly supplied slug always wins.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Project $project, array $data): Project
    {
        if (! empty($data['slug'])) {
            $data['slug'] = $this->uniqueSlug($data['slug'], $project->id);
        } elseif (isset($data['title']) && $data['title'] !== $project->title) {
            $data['slug'] = $this->uniqueSlug($data['title'], $project->id);
        } else {
            unset($data['slug']);
        }

        $project->update($data);

        return $project->refresh();
    }

    /**
     * Create or replace a project's case-study body. project_details has a
     * unique project_id, so this is an upsert rather than an insert.
     *
     * @param  array<string, mixed>  $data
     */
    public function saveCaseStudy(Project $project, array $data): ProjectDetail
    {
        return ProjectDetail::updateOrCreate(
            ['project_id' => $project->id],
            $data,
        );
    }

    /**
     * Slugify a title, appending -2, -3 … when the slug is already taken.
     * `$ignoreId` lets a project keep its own slug while being updated.
     */
    private function uniqueSlug(string $source, ?int $ignoreId = null): string
    {
        $base = Str::slug($source);

        // Str::slug returns '' for input with no alphanumerics (e.g. "***"),
        // which would violate the NOT NULL unique column.
        if ($base === '') {
            $base = 'project';
        }

        $slug = $base;
        $suffix = 2;

        while ($this->slugExists($slug, $ignoreId)) {
            $slug = $base.'-'.$suffix;
            $suffix++;
        }

        return $slug;
    }

    private function slugExists(string $slug, ?int $ignoreId): bool
    {
        return Project::query()
            ->where('slug', $slug)
            ->when($ignoreId, fn ($query) => $query->whereKeyNot($ignoreId))
            ->exists();
    }
}
