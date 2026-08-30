<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | The two Next.js apps that consume this API run on their own origins, so
    | every browser request to /api/* is cross-origin and needs these headers.
    |
    |   portfolio-frontend (public site) — http://localhost:3000
    |   portfolio-admin    (admin panel) — http://localhost:3001
    |
    | `supports_credentials` is true because portfolio-admin's axios client is
    | configured with `withCredentials: true`. That also means a wildcard
    | origin is not allowed — browsers reject `Access-Control-Allow-Origin: *`
    | on credentialed requests — so every origin has to be listed explicitly.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_unique(array_filter([
        env('FRONTEND_URL', 'http://localhost:3000'),
        env('ADMIN_URL', 'http://localhost:3001'),

        // Next.js sometimes picks the next free port when 3000/3001 are taken.
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',

        // TODO: replace these with the real production domains once deployed.
        'https://hasib.com',
        'https://www.hasib.com',
        'https://admin.hasib.com',
    ]))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
