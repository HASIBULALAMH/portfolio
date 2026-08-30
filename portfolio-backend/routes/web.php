<?php

/*
|--------------------------------------------------------------------------
| Web routes
|--------------------------------------------------------------------------
|
| Intentionally empty. This is an API-only backend — every endpoint lives in
| routes/api.php, and the two Next.js apps own all HTML. The file itself has
| to stay: bootstrap/app.php passes `web: __DIR__.'/../routes/web.php'` to
| withRouting(), so deleting it breaks the boot.
|
| This previously served Laravel's default `welcome` view, which was the only
| consumer of the Vite asset pipeline (resources/css, resources/js,
| vite.config.js, package.json). All of that was removed with it.
|
| The health check stays available at /up, registered by withRouting(health:).
|
*/
