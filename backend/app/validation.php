<?php

declare(strict_types=1);

class ValidationException extends \RuntimeException
{
    private array $errors;

    public function __construct(array $errors, int $code = 0, ?\Throwable $previous = null)
    {
        $this->errors = $errors;
        $message = 'Validation failed.';
        foreach ($errors as $e) {
            $message .= ' ' . ($e['field'] ?? '?') . ': ' . ($e['message'] ?? '?');
        }
        parent::__construct($message, $code, $previous);
    }

    public function getErrors(): array
    {
        return $this->errors;
    }
}

function validate_email(string $value): string
{
    $trimmed = trim($value);

    if ($trimmed === '') {
        throw new ValidationException([['field' => 'email', 'message' => 'Email is required.']]);
    }

    $lower = mb_strtolower($trimmed);

    if (strlen($lower) > 254) {
        throw new ValidationException([['field' => 'email', 'message' => 'Email exceeds maximum length.']]);
    }

    if (!filter_var($lower, FILTER_VALIDATE_EMAIL)) {
        throw new ValidationException([['field' => 'email', 'message' => 'Email is not valid.']]);
    }

    return $lower;
}

function validate_institutional_email(string $value): string
{
    $email = validate_email($value);

    $domain = substr(strrchr($email, '@'), 1);

    if ($domain !== 'bicol-u.edu.ph') {
        throw new ValidationException([['field' => 'email', 'message' => 'Only official Bicol University email addresses (@bicol-u.edu.ph) are allowed.']]);
    }

    return $email;
}

function validate_person_name(array $data, string $field, int $minBytes = 2, int $maxBytes = 255): string
{
    $name = validate_required_string($data, $field, $minBytes, $maxBytes);

    if (!preg_match('/^[\p{L}\s\'\-]+$/u', $name)) {
        throw new ValidationException([['field' => $field, 'message' => 'Name can only contain letters, spaces, hyphens, and apostrophes.']]);
    }

    return $name;
}


function validate_required_string(array $data, string $field, int $minBytes, int $maxBytes): string
{
    if (!array_key_exists($field, $data)) {
        throw new ValidationException([['field' => $field, 'message' => 'Field is required.']]);
    }

    if (!is_string($data[$field])) {
        throw new ValidationException([['field' => $field, 'message' => 'Field must be a string.']]);
    }

    $value = $data[$field];

    if (!mb_check_encoding($value, 'UTF-8')) {
        throw new ValidationException([['field' => $field, 'message' => 'Field contains invalid UTF-8.']]);
    }

    reject_control_chars($value, $field);

    $cleaned = trim($value);

    $len = strlen($cleaned);

    if ($len < $minBytes) {
        throw new ValidationException([['field' => $field, 'message' => "Must be at least $minBytes characters."]]);
    }

    if ($len > $maxBytes) {
        throw new ValidationException([['field' => $field, 'message' => "Must not exceed $maxBytes characters."]]);
    }

    return $cleaned;
}

function validate_optional_string(array $data, string $field, int $minBytes, int $maxBytes): ?string
{
    if (!array_key_exists($field, $data)) {
        return null;
    }

    if (!is_string($data[$field])) {
        throw new ValidationException([['field' => $field, 'message' => 'Field must be a string.']]);
    }

    $value = $data[$field];

    if ($value === '') {
        return null;
    }

    if (!mb_check_encoding($value, 'UTF-8')) {
        throw new ValidationException([['field' => $field, 'message' => 'Field contains invalid UTF-8.']]);
    }

    reject_control_chars($value, $field);

    $cleaned = trim($value);

    $len = strlen($cleaned);

    if ($len < $minBytes) {
        throw new ValidationException([['field' => $field, 'message' => "Must be at least $minBytes characters."]]);
    }

    if ($len > $maxBytes) {
        throw new ValidationException([['field' => $field, 'message' => "Must not exceed $maxBytes characters."]]);
    }

    return $cleaned;
}

function validate_enum(array $data, string $field, array $allowedValues): string
{
    $value = validate_required_string($data, $field, 1, 255);

    if (!in_array($value, $allowedValues, true)) {
        throw new ValidationException([['field' => $field, 'message' => 'Value is not in the allowed set.']]);
    }

    return $value;
}

function validate_int(array $data, string $field, int $min, int $max): int
{
    if (!array_key_exists($field, $data)) {
        throw new ValidationException([['field' => $field, 'message' => 'Field is required.']]);
    }

    if (!is_int($data[$field])) {
        throw new ValidationException([['field' => $field, 'message' => 'Field must be an integer.']]);
    }

    if ($data[$field] < $min || $data[$field] > $max) {
        throw new ValidationException([['field' => $field, 'message' => "Must be between $min and $max."]]);
    }

    return $data[$field];
}

function validate_uuid(string $value): string
{
    $pattern = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    if (!preg_match($pattern, $value)) {
        throw new ValidationException([['field' => 'uuid', 'message' => 'Must be a valid UUID.']]);
    }

    return strtolower($value);
}

function validate_opaque_token(string $value, int $expectedLen): string
{
    if (strlen($value) !== $expectedLen) {
        throw new ValidationException([['field' => 'token', 'message' => "Token must be exactly $expectedLen characters."]]);
    }

    if (!ctype_alnum($value)) {
        throw new ValidationException([['field' => 'token', 'message' => 'Token must be alphanumeric.']]);
    }

    return $value;
}

function validate_password_policy(string $password): void
{
    $errors = [];

    if (strlen($password) < 8) {
        $errors[] = ['field' => 'password', 'message' => 'Must be at least 8 characters.'];
    }

    if (!preg_match('/[A-Z]/', $password)) {
        $errors[] = ['field' => 'password', 'message' => 'Must contain an uppercase letter.'];
    }

    if (!preg_match('/[a-z]/', $password)) {
        $errors[] = ['field' => 'password', 'message' => 'Must contain a lowercase letter.'];
    }

    if (!preg_match('/[0-9]/', $password)) {
        $errors[] = ['field' => 'password', 'message' => 'Must contain a digit.'];
    }

    if (!preg_match('/[!@#$%^&*()_+\-=\[\]{};\':"\\\\|,.<>\/?]/', $password)) {
        $errors[] = ['field' => 'password', 'message' => 'Must contain a special character.'];
    }

    if (count($errors) > 0) {
        throw new ValidationException($errors);
    }
}

function reject_control_chars(string $value, string $field): void
{
    $len = strlen($value);

    for ($i = 0; $i < $len; $i++) {
        $byte = ord($value[$i]);

        if ($byte < 0x20 && $byte !== 0x09 && $byte !== 0x0A) {
            throw new ValidationException([['field' => $field, 'message' => 'Contains prohibited control characters.']]);
        }

        if ($byte === 0x7F) {
            throw new ValidationException([['field' => $field, 'message' => 'Contains prohibited control characters.']]);
        }
    }
}
