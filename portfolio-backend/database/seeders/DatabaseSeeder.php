<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     *
     * Both seeders are idempotent, so this is safe to re-run at any time. The
     * default "Test User" factory row is deliberately gone — this is a
     * single-admin system and the only account should be the real one.
     */
    public function run(): void
    {
        $this->call([
            AdminUserSeeder::class,
            SingletonSeeder::class,
            SectionVisibilitySeeder::class,
        ]);
    }
}
