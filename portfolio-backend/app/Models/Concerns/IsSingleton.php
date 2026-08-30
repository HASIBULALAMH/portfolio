<?php

namespace App\Models\Concerns;

/**
 * Shared behaviour for the four single-row config tables (settings, hero,
 * about, contact_info). Each is seeded with one empty row, and the API always
 * reads and writes that row rather than creating new ones.
 */
trait IsSingleton
{
    /**
     * The one row for this table, created on demand if the seeder never ran.
     */
    public static function singleton(): static
    {
        return static::query()->firstOrCreate([]);
    }
}
