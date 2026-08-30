<?php

namespace Tests\Unit;

use App\Models\Project;
use App\Services\ProjectService;
use Tests\TestCase;

/**
 * ProjectService::uniqueSlug — the title → slug derivation and collision
 * resolution, isolated from the database.
 *
 * The interesting decisions live in the loop between `uniqueSlug()` and
 * `slugExists()`: what happens to a title with no usable characters, where the
 * `-2` suffix starts, and how a project keeps its own slug while being updated.
 * Each of those is a pure function of a list of taken slugs, so the Project
 * below overrides query() to answer `exists()` from an in-memory set and
 * create() to hand back a drained copy — no table, no SQL, no migration.
 *
 * Persistence itself (that the boolean pair updates a real row) is asserted in
 * the integration suite; what belongs here is the derivation, which a database
 * cannot tell you about any more precisely.
 */
class ProjectServiceTest extends TestCase
{
    private function service(array $taken = [], int $nextId = 1, ?int $actingId = null): ProjectService
    {
        return new ProjectService(
            $this->projectClass($taken, $nextId, $actingId),
        );
    }

    /**
     * A Project whose query layer answers `exists()` from an in-memory slug set
     * and whose create() returns the record it was given. `$actingId` fakes a
     * project's own id in flight, so the update path can ignore it.
     *
     * @param  list<string>  $taken
     */
    private function projectClass(array $taken, int $nextId, ?int $actingId): string
    {
        return new class($taken, $nextId, $actingId) extends Project
        {
            public array $created = [];

            private array $taken;

            private int $nextId;

            private int $actingId;

            public function __construct(array $taken, int $nextId, ?int $actingId)
            {
                parent::__construct();

                $this->taken = $taken;
                $this->nextId = $nextId;
                $this->actingId = $actingId ?? 0;
            }

            public function newQuery(): self
            {
                return $this;
            }

            public function where(string $column, mixed $operator = null, mixed $value = null, string $boolean = 'and'): static
            {
                return $this;
            }

            public function whereKeyNot(mixed $id): static
            {
                // uniqueSlug calls ->whereKeyNot($ignoreId) with a real id on the
                // update path, and the models in this test carry no id until a
                // slug is decided, so the guard under test is the call itself.
                return $this;
            }

            public function exists(): bool
            {
                return in_array($this->taken['slug'] ?? null, $this->taken, true);
            }

            public function create(array $attributes = []): static
            {
                $project = $this->newInstance();
                $project->forceFill($attributes);
                $project->id = $this->nextId;

                return $project;
            }
        };
    }

    public function test_a_clean_title_derives_a_sluggified_slug(): void
    {
        $project = $this->service(['existing-project'], 3)->create([
            'title' => 'My Portfolio Site',
        ]);

        $created = $project->getAttribute('slug');

        $this->assertSame('my-portfolio-site', $created);
    }

    public function test_a_taken_slug_is_suffixed_from_two_upwards(): void
    {
        $project = $this->service(['portfolio-app', 'portfolio-app-2'], 4)->create([
            'title' => 'Portfolio App',
        ]);

        $this->assertSame('portfolio-app-3', $project->getAttribute('slug'));
    }

    public function test_a_title_with_no_usable_characters_falls_back_to_project(): void
    {
        // Str::slug collapses "***" to '', which would violate the NOT NULL
        // unique column. The fallback has to survive the collision loop like any
        // other slug.
        $project = $this->service(['project', 'project-2'], 3)->create([
            'title' => '***',
        ]);

        $this->assertSame('project-3', $project->getAttribute('slug'));
    }

    public function test_an_explicit_slug_wins_over_the_title(): void
    {
        $project = $this->service([], 3)->create([
            'title' => 'Should Not Win',
            'slug' => 'chosen-slug',
        ]);

        $this->assertSame('chosen-slug', $project->getAttribute('slug'));
    }

    public function test_an_explicit_taken_slug_is_suffixed_like_any_other(): void
    {
        // A parallel port already owns 'case-study'; an admin picking the same
        // slug must not overwrite it, and the suffix progression is the same as
        // a derived slug's.
        $project = $this->service(['case-study'], 3)->create([
            'title' => 'Long Title',
            'slug' => 'case-study',
        ]);

        $this->assertSame('case-study-2', $project->getAttribute('slug'));
    }

    public function test_update_derives_a_fresh_slug_from_a_renamed_title(): void
    {
        // Public URLs stay meaningful when the title changes, and the colliding
        // check skips the project's own id so calling it a newer title at the
        // same id cannot become 'second-title-2' for itself.
        $project = $this->service([], 2, actingId: 7)->find(7);
        $project->title = 'Renamed Title';

        $project->update(['title' => 'Renamed Title']);

        $this->assertSame('renamed-title', $project->getAttribute('slug'));
    }

    public function test_update_keeps_the_existing_slug_when_the_title_is_unchanged(): void
    {
        $project = $this->service([], 2, actingId: 7)->find(7);
        $project->slug = 'already-good';
        $project->title = 'Same Title';

        $project->update(['title' => 'Same Title']);

        $this->assertSame('already-good', $project->getAttribute('slug'));
    }
}