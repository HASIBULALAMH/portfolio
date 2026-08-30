# Portfolio CMS — backend API

Laravel API that serves the public portfolio (`portfolio-frontend`, :3000) and
the admin panel (`portfolio-admin`, :3001). **Runs on port 8000.**

This is an **API-only** backend: it renders no HTML. `routes/web.php` is
intentionally empty and `GET /` returns 404 — every endpoint lives under `/api`
in `routes/api.php`. The health check is at `/up`.

## Setup and everything else

See **[BACKEND-SETUP.md](BACKEND-SETUP.md)** — install, database, seeding, mail
(Resend), Cloudflare R2 uploads, and the endpoint reference.

```bash
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate && php artisan db:seed
php artisan serve            # http://127.0.0.1:8000
```

`../project-run.md` covers starting all three services together.

## Shape of the API

Every response — success or failure — uses the same envelope:

```json
{ "data": ..., "message": "...", "errors": ... }
```

Framework exceptions are mapped onto it in `bootstrap/app.php`, so a 401, 404 or
422 has the same shape as a 200.

Conventions: validation via Form Requests, output via API Resources, and every
route under `/api/admin` behind `auth:sanctum`.

## Tests

```bash
php artisan test
```

Requires a `portfolio_backend_test` database (see the comment in `phpunit.xml` —
this environment has `pdo_mysql` only, so the suite uses MySQL rather than
Laravel's default in-memory SQLite).

`scripts/smoke-test.sh` exercises the live API end to end. Note it is currently
out of date: it still covers the `nav-items` endpoints that were dropped in
favour of `section-visibility`, so it reports failures that are the test's, not
the API's.
