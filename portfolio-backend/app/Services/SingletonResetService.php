<?php

namespace App\Services;

use App\Models\About;
use App\Models\ContactInfo;
use App\Models\Hero;
use App\Models\Project;
use App\Models\ProjectDetail;
use App\Models\Setting;
use App\Models\Testimonial;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Blanks one of the four singleton config rows (settings, hero, about,
 * contact_info) back to an empty state.
 *
 * One generic service rather than four near-identical controller methods,
 * because the four models really are uniform: each uses the IsSingleton trait,
 * every column is nullable, and the reset rule follows from the column type
 * alone. The only per-model knowledge needed is which columns hold file paths
 * and which hold JSON arrays, and both are derived below rather than hardcoded
 * per model.
 *
 * The row is never deleted — a singleton must always exist, and
 * `IsSingleton::singleton()` would just recreate it on the next read anyway.
 */
class SingletonResetService
{
    /**
     * Columns holding an uploaded file reference, on any model in the app.
     *
     * Used for two things: deciding which columns to null out *and* delete
     * storage for, and scanning for other rows that still reference the same
     * file. Keep this in sync when a new *_path column is added anywhere —
     * missing an entry here means a reset could delete a file another record
     * still points at.
     */
    private const PATH_COLUMNS = [
        Setting::class => ['favicon_path', 'logo_path'],
        Hero::class => ['image_path', 'cv_path'],
        About::class => ['image_path'],
        Project::class => ['image_path'],
        ProjectDetail::class => ['document_path'],
        Testimonial::class => ['avatar_path'],
        ContactInfo::class => [],
    ];

    /** Columns cast to array/json, which reset to [] rather than null. */
    private const ARRAY_COLUMNS = [
        About::class => ['stats'],
        Hero::class => ['roles', 'tech_badges', 'social_links'],
    ];

    /**
     * Columns that are NOT NULL and carry a meaningful default, which a reset
     * restores rather than nulling.
     *
     * The rest of this class leans on every column being nullable (see the
     * class docblock); these are the exceptions, because "no value" is not a
     * state either field can be in. Nulling them would fail the NOT NULL
     * constraint and 500 the whole reset.
     *
     * `settings.logo_type` resets to 'text' rather than 'image': a reset deletes
     * the uploaded logo file, so leaving the type on 'image' would point the
     * site at a file that no longer exists. 'text' degrades to the brand-name
     * wordmark, which always renders.
     */
    private const DEFAULT_COLUMNS = [
        Hero::class => ['is_available' => true],
        Setting::class => ['logo_type' => 'text'],
    ];

    public function __construct(private readonly UploadService $uploads) {}

    /**
     * Clear every field on the given singleton.
     *
     * @return array{model: Model, deleted_files: array<int, string>, kept_files: array<int, string>}
     */
    public function reset(Model $singleton): array
    {
        $class = $singleton::class;
        $pathColumns = self::PATH_COLUMNS[$class] ?? [];
        $arrayColumns = self::ARRAY_COLUMNS[$class] ?? [];

        $deleted = [];
        $kept = [];

        // Delete storage BEFORE blanking the row. If it were done after, the
        // "is this file referenced elsewhere" check below would no longer see
        // this row's own values and could not tell a shared file from a
        // sole-owner one.
        foreach ($pathColumns as $column) {
            $value = $singleton->getAttribute($column);

            if (blank($value)) {
                continue;
            }

            if ($this->isReferencedElsewhere($value, $singleton)) {
                $kept[] = $value;

                Log::info('Singleton reset kept a shared file.', [
                    'model' => $class,
                    'column' => $column,
                    'value' => $value,
                    'reason' => 'still referenced by another record',
                ]);

                continue;
            }

            if ($this->deleteStoredFile($value)) {
                $deleted[] = $value;
            }
        }

        $updates = [];
        $defaults = self::DEFAULT_COLUMNS[$class] ?? [];

        foreach (array_keys($this->resettableAttributes($singleton)) as $column) {
            if (array_key_exists($column, $defaults)) {
                $updates[$column] = $defaults[$column];
            } elseif (in_array($column, $arrayColumns, true)) {
                $updates[$column] = [];
            } else {
                // Every column on these four tables is nullable, so null is the
                // honest "unset" value. It also round-trips as an empty input in
                // the admin forms, which coerce null to ''.
                $updates[$column] = null;
            }
        }

        $singleton->forceFill($updates)->save();

        Log::info('Singleton reset completed.', [
            'model' => $class,
            'id' => $singleton->getKey(),
            'columns_cleared' => array_keys($updates),
            'files_deleted' => $deleted,
            'files_kept' => $kept,
        ]);

        return [
            'model' => $singleton->refresh(),
            'deleted_files' => $deleted,
            'kept_files' => $kept,
        ];
    }

    /**
     * The model's fillable columns — i.e. everything the admin panel can set,
     * which is exactly what a reset should clear. Deliberately not the full
     * column list: that would include id and timestamps.
     *
     * @return array<string, mixed>
     */
    private function resettableAttributes(Model $singleton): array
    {
        return array_fill_keys($singleton->getFillable(), null);
    }

    /**
     * Is this stored file still pointed at by any other record?
     *
     * Uploads are addressed by their public URL (that is what FileUpload.jsx
     * stores), and nothing stops an admin from picking the same uploaded image
     * as both the logo and the hero image. Deleting on reset without this check
     * would break the other section silently.
     *
     * The ENTIRE owner row is excluded, not just the column being cleared:
     * every path column on that row is about to be blanked by this same reset,
     * so a sibling column pointing at the same file is not a surviving
     * reference. Excluding only the one column would make a file used as both
     * logo and favicon look shared, and it would be orphaned on disk forever.
     */
    private function isReferencedElsewhere(string $value, Model $owner): bool
    {
        foreach (self::PATH_COLUMNS as $class => $columns) {
            foreach ($columns as $column) {
                $query = $class::query()->where($column, $value);

                if ($class === $owner::class) {
                    $query->whereKeyNot($owner->getKey());
                }

                if ($query->exists()) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Remove an uploaded file from whichever disk is active.
     *
     * The stored value is a public URL, not a disk path, so the storage-relative
     * path has to be recovered from it. Returns false when the value does not
     * look like something this app uploaded — an admin can paste an arbitrary
     * external URL into these fields, and deleting is not ours to do there.
     */
    private function deleteStoredFile(string $value): bool
    {
        $disk = $this->uploads->disk();
        $path = $this->storagePathFor($value, $disk);

        if ($path === null) {
            Log::info('Singleton reset skipped a non-uploaded file reference.', [
                'value' => $value,
                'reason' => 'not recognised as a path on the active disk',
            ]);

            return false;
        }

        try {
            if (! Storage::disk($disk)->exists($path)) {
                Log::info('Singleton reset found no file to delete.', [
                    'disk' => $disk,
                    'path' => $path,
                ]);

                return false;
            }

            Storage::disk($disk)->delete($path);

            Log::info('Singleton reset deleted an uploaded file.', [
                'disk' => $disk,
                'path' => $path,
                'value' => $value,
            ]);

            return true;
        } catch (\Throwable $e) {
            // A failed delete must not fail the reset: the admin asked for the
            // fields to be cleared, and leaving a stray file behind is a much
            // smaller problem than a 500 on a destructive action they will
            // simply retry.
            Log::warning('Singleton reset could not delete an uploaded file.', [
                'disk' => $disk,
                'path' => $path,
                'exception' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Map a stored public URL back to its path on `$disk`.
     *
     * Only the folders UploadService writes to are accepted, so a crafted or
     * mistyped value cannot address anything else on the disk.
     */
    private function storagePathFor(string $value, string $disk): ?string
    {
        $candidate = $value;

        // R2 stores an absolute URL under the configured public base.
        if ($disk === 'r2' && $base = config('filesystems.disks.r2.url')) {
            $prefix = rtrim($base, '/').'/';

            if (! str_starts_with($value, $prefix)) {
                return null;
            }

            $candidate = substr($value, strlen($prefix));
        } else {
            // The local `public` disk is served from /storage/<path>.
            $path = parse_url($value, PHP_URL_PATH);

            if ($path === false || $path === null) {
                return null;
            }

            $candidate = ltrim($path, '/');
            $candidate = preg_replace('#^storage/#', '', $candidate);
        }

        $candidate = ltrim(urldecode($candidate), '/');

        // No traversal, and only inside a folder UploadService owns.
        if ($candidate === '' || str_contains($candidate, '..')) {
            return null;
        }

        $folder = strtok($candidate, '/');

        return in_array($folder, $this->uploadFolders(), true) ? $candidate : null;
    }

    /** @return array<int, string> */
    private function uploadFolders(): array
    {
        return array_values(array_unique(array_map(
            fn (string $type) => UploadService::rulesFor($type)['folder'],
            UploadService::types(),
        )));
    }
}
