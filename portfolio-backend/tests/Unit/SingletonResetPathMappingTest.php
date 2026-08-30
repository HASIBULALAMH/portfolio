<?php

namespace Tests\Unit;

use App\Services\SingletonResetService;
use App\Services\UploadService;
use ReflectionMethod;
use Tests\TestCase;

/**
 * The stored-URL → disk-path mapping that decides which file a reset may delete.
 *
 * Unit, not feature: `storagePathFor()` touches no database and no real disk. It
 * reads two config values and the static UploadService folder list, both of which
 * are set explicitly per test so the result never depends on whether this machine
 * happens to have R2 credentials in `.env`.
 *
 * Worth pinning at this level because the method is the only thing standing
 * between an admin-supplied string and `Storage::delete()`. Two of its rules are
 * security properties rather than conveniences:
 *
 *   - a value must resolve inside a folder UploadService itself writes to, so a
 *     crafted path cannot address anything else on the disk;
 *   - `..` is refused outright.
 *
 * A mutation that relaxes either would still pass every existing reset test,
 * because those only ever feed it well-formed URLs.
 *
 * Reflection is used deliberately: making the method public to test it would
 * widen the service's API for no caller's benefit, and the behaviour under test
 * is genuinely a unit of its own.
 */
class SingletonResetPathMappingTest extends TestCase
{
    private function mapper(): ReflectionMethod
    {
        $method = new ReflectionMethod(SingletonResetService::class, 'storagePathFor');
        $method->setAccessible(true);

        return $method;
    }

    private function service(): SingletonResetService
    {
        return new SingletonResetService(new UploadService);
    }

    private function map(string $value, string $disk): ?string
    {
        return $this->mapper()->invoke($this->service(), $value, $disk);
    }

    // ---------------------------------------------------------------------
    // Local `public` disk — values look like http://host/storage/<folder>/<file>
    // ---------------------------------------------------------------------

    public function test_a_local_storage_url_maps_to_its_disk_relative_path(): void
    {
        $this->assertSame(
            'logos/abc.png',
            $this->map('http://localhost:8000/storage/logos/abc.png', 'public'),
        );
    }

    public function test_the_storage_prefix_is_stripped_only_at_the_start(): void
    {
        // A file legitimately named "storage" deeper in the path must survive.
        $this->assertSame(
            'uploads/storage/abc.png',
            $this->map('http://localhost:8000/storage/uploads/storage/abc.png', 'public'),
        );
    }

    public function test_a_bare_path_without_a_host_still_maps(): void
    {
        // FileUpload.jsx has stored both absolute URLs and root-relative paths
        // across the project's history, so both shapes have to resolve.
        $this->assertSame('avatars/x.webp', $this->map('/storage/avatars/x.webp', 'public'));
    }

    public function test_a_percent_encoded_filename_is_decoded(): void
    {
        $this->assertSame(
            'uploads/my file.pdf',
            $this->map('http://localhost:8000/storage/uploads/my%20file.pdf', 'public'),
        );
    }

    public function test_a_query_string_and_fragment_are_discarded(): void
    {
        // Cache-busting suffixes are common on values pasted back in by hand.
        $this->assertSame(
            'logos/abc.png',
            $this->map('http://localhost:8000/storage/logos/abc.png?v=2#top', 'public'),
        );
    }

    // ---------------------------------------------------------------------
    // The folder allowlist — the containment rule
    // ---------------------------------------------------------------------

    public function test_every_folder_upload_service_writes_to_is_accepted(): void
    {
        // Derived from UploadService rather than hardcoded: a new upload type
        // whose folder is missing from the allowlist would silently stop being
        // deletable, and this is the assertion that notices.
        foreach (UploadService::types() as $type) {
            $folder = UploadService::rulesFor($type)['folder'];

            $this->assertSame(
                "{$folder}/file.png",
                $this->map("http://localhost:8000/storage/{$folder}/file.png", 'public'),
                "the [{$folder}] folder is written to by upload type [{$type}] but is not deletable",
            );
        }
    }

    public function test_a_folder_upload_service_never_writes_to_is_refused(): void
    {
        $this->assertNull($this->map('http://localhost:8000/storage/framework/cache/x', 'public'));
        $this->assertNull($this->map('http://localhost:8000/storage/app/private/secret.pdf', 'public'));
    }

    public function test_a_file_at_the_disk_root_is_refused(): void
    {
        // No folder segment at all means the allowlist check has nothing to
        // match, and the disk root is not a place uploads live.
        $this->assertNull($this->map('http://localhost:8000/storage/loose.png', 'public'));
    }

    public function test_traversal_is_refused_even_under_an_allowed_folder(): void
    {
        $this->assertNull($this->map('http://localhost:8000/storage/logos/../../.env', 'public'));
        $this->assertNull($this->map('http://localhost:8000/storage/uploads/..%2f..%2f.env', 'public'));
    }

    public function test_an_empty_value_is_refused(): void
    {
        $this->assertNull($this->map('http://localhost:8000/storage/', 'public'));
    }

    public function test_an_arbitrary_external_url_is_refused(): void
    {
        // An admin may paste a URL this app never uploaded. Deleting is not ours
        // to do there, and the folder check is what prevents it.
        $this->assertNull($this->map('https://cdn.example.com/images/logo.png', 'public'));
    }

    // ---------------------------------------------------------------------
    // R2 disk — values are absolute URLs under the configured public base
    // ---------------------------------------------------------------------

    public function test_an_r2_url_under_the_configured_base_maps_to_its_key(): void
    {
        config(['filesystems.disks.r2.url' => 'https://pub-abc.r2.dev']);

        $this->assertSame(
            'uploads/abc.png',
            $this->map('https://pub-abc.r2.dev/uploads/abc.png', 'r2'),
        );
    }

    public function test_a_trailing_slash_on_the_configured_base_is_tolerated(): void
    {
        config(['filesystems.disks.r2.url' => 'https://pub-abc.r2.dev/']);

        $this->assertSame(
            'uploads/abc.png',
            $this->map('https://pub-abc.r2.dev/uploads/abc.png', 'r2'),
        );
    }

    public function test_an_r2_url_under_a_different_host_is_refused(): void
    {
        // The prefix check is what stops a reset reaching into another bucket or
        // an unrelated CDN that happens to use the same folder names.
        config(['filesystems.disks.r2.url' => 'https://pub-abc.r2.dev']);

        $this->assertNull($this->map('https://pub-other.r2.dev/uploads/abc.png', 'r2'));
    }

    public function test_an_r2_value_still_has_to_sit_in_an_upload_folder(): void
    {
        config(['filesystems.disks.r2.url' => 'https://pub-abc.r2.dev']);

        $this->assertNull($this->map('https://pub-abc.r2.dev/backups/dump.sql', 'r2'));
    }

    public function test_r2_without_a_configured_public_base_falls_back_to_path_parsing(): void
    {
        // R2_URL unset is a supported state (UploadService::urlFor falls back to
        // Storage::url), so the reverse mapping must not simply refuse everything.
        config(['filesystems.disks.r2.url' => null]);

        $this->assertSame('uploads/abc.png', $this->map('/storage/uploads/abc.png', 'r2'));
    }
}
