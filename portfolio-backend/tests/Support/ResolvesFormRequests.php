<?php

namespace Tests\Support;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Validator as ValidatorFacade;
use Illuminate\Validation\ValidationException;

/**
 * Run a FormRequest's rules the way the framework does — including
 * prepareForValidation() and withValidator() — without an HTTP round trip, a
 * route, middleware or a database.
 *
 * `validateResolved()` is what Laravel itself calls when a FormRequest is
 * injected into a controller action, so exercising it means the normalisation
 * hooks are covered rather than only the static rules array. Anything that
 * queries inside withValidator() (SectionVisibilityBulkRequest) belongs in a
 * Feature test instead.
 */
trait ResolvesFormRequests
{
    /**
     * @param  class-string<FormRequest>  $class
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>  the validated data
     *
     * @throws ValidationException
     */
    protected function validateRequest(string $class, array $payload, string $method = 'POST'): array
    {
        /** @var FormRequest $request */
        $request = $class::create('/test', $method, $payload);

        $request->setContainer(app());
        $request->setRedirector(app('redirect'));

        $request->validateResolved();

        return $request->validated();
    }

    /**
     * @param  class-string<FormRequest>  $class
     * @param  array<string, mixed>  $payload
     * @return array<string, array<int, string>>  the error bag, keyed by field
     */
    protected function validationErrorsFor(string $class, array $payload, string $method = 'POST'): array
    {
        try {
            $this->validateRequest($class, $payload, $method);
        } catch (ValidationException $e) {
            return $e->errors();
        }

        return [];
    }

    /**
     * @param  class-string<FormRequest>  $class
     * @param  array<string, mixed>  $payload
     */
    protected function assertPasses(string $class, array $payload, string $method = 'POST'): void
    {
        $errors = $this->validationErrorsFor($class, $payload, $method);

        $this->assertSame([], $errors, 'expected the payload to validate, got: '.json_encode($errors));
    }

    /**
     * @param  class-string<FormRequest>  $class
     * @param  array<string, mixed>  $payload
     */
    protected function assertFailsOn(string $class, array $payload, string $field, string $method = 'POST'): void
    {
        $errors = $this->validationErrorsFor($class, $payload, $method);

        $this->assertArrayHasKey(
            $field,
            $errors,
            "expected a validation error on [{$field}], got: ".json_encode($errors),
        );
    }
}
