<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;

/**
 * Sends a one-line test email so mail delivery can be verified without going
 * through the admin UI and creating a real meeting-request reply.
 *
 * Deliberately uses Mail::raw rather than the reply Mailable: this proves the
 * transport and credentials work in isolation. If this succeeds but a real
 * reply fails, the problem is in the Mailable or its view, not the mailer.
 */
class TestResendMail extends Command
{
    protected $signature = 'mail:test-resend
                            {email : Recipient address for the test message}
                            {--mailer= : Override the configured mailer (e.g. log, smtp)}';

    protected $description = 'Send a one-line test email to verify mail delivery';

    public function handle(): int
    {
        $email = (string) $this->argument('email');

        // Fail on a typo'd address before involving the transport, so a bad
        // argument does not look like a delivery failure.
        $validator = Validator::make(
            ['email' => $email],
            ['email' => ['required', 'email:rfc']],
        );

        if ($validator->fails()) {
            $this->components->error("Not a valid email address: {$email}");

            return self::FAILURE;
        }

        $mailer = $this->option('mailer') ?: config('mail.default');
        $from = config('mail.from.address');
        $apiKeySet = filled(config('services.resend.key'));

        $this->components->twoColumnDetail('Mailer', $mailer);
        $this->components->twoColumnDetail('From', (string) $from);
        $this->components->twoColumnDetail('To', $email);

        if ($mailer === 'resend') {
            $this->components->twoColumnDetail(
                'RESEND_API_KEY',
                $apiKeySet ? '<fg=green>set</>' : '<fg=red>missing</>',
            );

            if (! $apiKeySet) {
                $this->components->error(
                    'RESEND_API_KEY is empty. Add it to .env, then run '
                    .'`php artisan config:clear` if you have cached config.',
                );

                return self::FAILURE;
            }
        }

        if ($mailer === 'log') {
            $this->components->warn(
                'The log mailer does not send anything — it writes to '
                .'storage/logs/laravel.log.',
            );
        }

        $sentAt = now()->toDateTimeString();

        try {
            Mail::mailer($mailer)
                ->raw(
                    "Resend test from the Portfolio CMS backend, sent {$sentAt}.",
                    fn ($message) => $message
                        ->to($email)
                        ->subject('Portfolio CMS — Resend test'),
                );
        } catch (\Throwable $e) {
            // Surface the transport's own message: Resend is specific about
            // unverified domains and invalid keys, and that detail is the whole
            // point of running this command.
            $this->newLine();
            $this->components->error('Send failed: '.$e->getMessage());
            $this->line('  <fg=gray>'.get_class($e).'</>');
            $this->newLine();
            $this->line('  Common causes:');
            $this->line('  <fg=gray>•</> Invalid or revoked API key.');
            $this->line('  <fg=gray>•</> MAIL_FROM_ADDRESS uses a domain not verified in Resend.');
            $this->line('    Use onboarding@resend.dev until your own domain is verified.');
            $this->line('  <fg=gray>•</> Resend test mode only delivers to your own account address.');

            return self::FAILURE;
        }

        $this->newLine();
        $this->components->info("Test email dispatched to {$email}.");

        if ($mailer === 'log') {
            $this->line('  <fg=gray>Check storage/logs/laravel.log for the rendered message.</>');
        } else {
            $this->line('  <fg=gray>Delivery is asynchronous — check the inbox, then</>');
            $this->line('  <fg=gray>https://resend.com/emails for the delivery status.</>');
        }

        return self::SUCCESS;
    }
}
