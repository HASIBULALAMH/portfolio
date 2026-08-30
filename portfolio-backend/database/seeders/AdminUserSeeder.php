<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Single-admin system: this seeder owns the one real admin account. It is
 * idempotent, so re-running `php artisan db:seed` resets the password back to
 * the known value rather than creating a duplicate user.
 */
class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'info@hasib.com'],
            [
                'name' => 'Hasibul Alam',
                'password' => Hash::make('42862266'),
                'role' => 'admin',
            ],
        );
    }
}
