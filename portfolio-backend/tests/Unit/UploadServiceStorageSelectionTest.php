<?php

namespace Tests\Unit;

use App\Services\UploadService;
use Illuminate\Http\UploadedFile;
use ReflectionMethod;
use ReflectionProperty;
use Tests\TestCase;

/**
 * UploadService::disk / ::extensionFor / the R2 branch of ::urlFor — the
 * storage-selection and filename logic that UploadServiceRulesTest deliberately
 * leaves out.
 *
 * The three methods are private (they only make sense through store(), which
 * writes to a disk and is integration territory), so they are exercised here
 * via reflection with no container, database or filesystem involved.
 *
 * `disk()` picking 'public' when R2 is only partially configured (a key but no
 * bucket, for example) is the exact class of failure Chapter 7 of the audit
 * report injects: a silent fallback to local storage instead of a hard error.
 * `extensionFor()` derives the stored extension from the verified MIME type, so
 * a client uploading `evil.php` as an image gets a `.png` extension, never `.php`.
 */
class UploadServiceStorageSelectionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config()->set('filesystems.disks.r2.key', '');
        config()->set('filesystems.disks.r2.bucket', '');
        config()->set('filesystems.disks.r2.endpoint', '');
        config()->set('filesystems.disks.r2.url', '');
    }

    public function test_r2_is_selected_when_all_three_credentials_are_present(): void
    {
        config()->set('filesystems.disks.r2.key', 'access-key');
        config()->set('filesystems.disks.r2.bucket', 'portfolio-assets');
        config()->set('filesystems.disks.r2.endpoint', 'https://r2.example.test');

        $this->assertSame('r2', (new UploadService)->disk());
    }

    public function test_missing_bucket_falls_back_to_public_disk(): void
    {
        config()->set('filesystems.disks.r2.key', 'access-key');
        config()->set('filesystems.disks.r2.endpoint', 'https://r2.example.test');

        $this->assertSame('public', (new UploadService)->disk());
    }

    public function test_missing_key_falls_back_to_public_disk(): void
    {
        config()->set('filesystems.disks.r2.bucket', 'portfolio-assets');
        config()->set('filesystems.disks.r2.endpoint', 'https://r2.example.test');

        $this->assertSame('public', (new UploadService)->disk());
    }

    public function test_missing_endpoint_falls_back_to_public_disk(): void
    {
        config()->set('filesystems.disks.r2.key', 'access-key');
        config()->set('filesystems.disks.r2.bucket', 'portfolio-assets');

        $this->assertSame('public', (new UploadService)->disk());
    }

    public function test_r2_url_joins_base_and_path_with_single_slash(): void
    {
        config()->set('filesystems.disks.r2.key', 'access-key');
        config()->set('filesystems.disks.r2.bucket', 'portfolio-assets');
        config()->set('filesystems.disks.r2.endpoint', 'https://r2.example.test');
        // Trailing slash on the base is the realistic misconfiguration.
        config()->set('filesystems.disks.r2.url', 'https://assets.example.test/');

        $url = $this->invoke(new UploadService, 'urlFor', 'r2', 'hero/abc123.jpg');

        $this->assertSame('https://assets.example.test/hero/abc123.jpg', $url);
    }

    public function test_known_mime_types_map_to_their_storage_extensions(): void
    {
        $service = new UploadService;

        $this->assertSame('jpg', $this->extOf($service, 'image/jpeg', 'photo.jpg'));
        $this->assertSame('png', $this->extOf($service, 'image/png', 'photo.png'));
        $this->assertSame('webp', $this->extOf($service, 'image/webp', 'photo.webp'));
        $this->assertSame('gif', $this->extOf($service, 'image/gif', 'photo.gif'));
        $this->assertSame('svg', $this->extOf($service, 'image/svg+xml', 'photo.svg'));
        $this->assertSame('ico', $this->extOf($service, 'image/x-icon', 'favicon.ico'));
        $this->assertSame('pdf', $this->extOf($service, 'application/pdf', 'doc.pdf'));
    }

    public function test_mime_type_wins_over_client_extension(): void
    {
        $service = new UploadService;

        // A `.php` client filename is never stored as `.php`; the verified MIME
        // type (image/png) is what determines the stored extension.
        $this->assertSame('png', $this->extOf($service, 'image/png', 'shell.php'));
    }

    public function test_unknown_mime_falls_back_to_file_extension(): void
    {
        $service = new UploadService;

        $this->assertSame('txt', $this->extOf($service, 'text/plain', 'notes.txt'));
    }

    public function test_unknown_mime_without_extension_falls_back_to_bin(): void
    {
        $service = new UploadService;

        $this->assertSame('bin', $this->extOf($service, 'application/octet-stream', 'blob'));
    }

    private function extOf(UploadService $service, string $mime, string $originalName): string
    {
        return $this->invoke($service, 'extensionFor', static::fakeUpload($mime, $originalName));
    }

    private function invoke(UploadService $service, string $method, mixed ...$args): mixed
    {
        $method = new ReflectionMethod(UploadService::class, $method);
        $method->setAccessible(true);

        return $method->invoke($service, ...$args);
    }

    private static function fakeUpload(string $mime, string $originalName): UploadedFile
    {
        $file = UploadedFile::fake()->createWithContent($originalName, 'data');

        // FakeUploadedFile returns its own mimeTypeToReport property from
        // getMimeType(); overwrite it so we control what extensionFor() sees.
        $property = new ReflectionProperty($file, 'mimeTypeToReport');
        $property->setAccessible(true);
        $property->setValue($file, $mime);

        return $file;
    }
}