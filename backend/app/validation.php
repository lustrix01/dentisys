<?php

declare(strict_types=1);

class ValidationException extends \RuntimeException
{
    private array $errors;

    public function __construct(array $errors, int $code = 0, ?\Throwable $previous = null)
    {
        $normalized = [];
        foreach ($errors as $key => $error) {
            $fallbackField = is_string($key) ? $key : 'general';
            if (is_array($error) && isset($error['message'])) {
                $normalized[] = [
                    'field' => (string) ($error['field'] ?? $fallbackField),
                    'message' => (string) $error['message'],
                ];
                continue;
            }
            if (is_string($error) && trim($error) !== '') {
                $normalized[] = ['field' => $fallbackField, 'message' => trim($error)];
                continue;
            }
            if (is_array($error) && is_string($key)) {
                foreach ($error as $message) {
                    if (is_string($message) && trim($message) !== '') {
                        $normalized[] = ['field' => $key, 'message' => trim($message)];
                    }
                }
            }
        }
        if ($normalized === []) {
            $normalized[] = ['field' => 'general', 'message' => 'Review the entered information and try again.'];
        }
        $this->errors = $normalized;
        $message = 'Validation failed.';
        foreach ($normalized as $error) {
            $message .= ' ' . $error['field'] . ': ' . $error['message'];
        }
        parent::__construct($message, $code, $previous);
    }

    public function getErrors(): array
    {
        return $this->errors;
    }
}

function validation_field_label(string $field): string
{
    $known = [
        'firstName' => 'First name', 'middleName' => 'Middle name', 'lastName' => 'Last name',
        'studentId' => 'Student ID', 'studentNumber' => 'Student number', 'yearLevel' => 'Year level',
        'email' => 'University email', 'classId' => 'Class section', 'csId' => 'Class section',
        'sessionDate' => 'Session date', 'meetingDay' => 'Class meeting', 'classEndTime' => 'Class end time',
        'openingTime' => 'Opening time', 'presentCutoff' => 'Present cutoff', 'lateCutoff' => 'Late cutoff',
        'academicTermId' => 'Academic term', 'general' => 'Input',
    ];
    if (isset($known[$field])) return $known[$field];
    $label = preg_replace('/([a-z0-9])([A-Z])/', '$1 $2', $field) ?? $field;
    return ucfirst(str_replace('_', ' ', $label));
}

function validate_email(string $value): string
{
    $trimmed = trim($value);

    if ($trimmed === '') {
        throw new ValidationException([['field' => 'email', 'message' => 'Email is required.']]);
    }

    $lower = mb_strtolower($trimmed);

    if (strlen($lower) > 254) {
        throw new ValidationException([['field' => 'email', 'message' => 'Email must be 254 characters or fewer. Shorten the address and try again.']]);
    }

    if (!filter_var($lower, FILTER_VALIDATE_EMAIL)) {
        throw new ValidationException([['field' => 'email', 'message' => 'Enter a complete email address such as name@bicol-u.edu.ph, then check for spelling errors.']]);
    }

    return $lower;
}

function validate_institutional_email(string $value): string
{
    $email = validate_email($value);

    $domain = substr(strrchr($email, '@'), 1);
    $configured = function_exists('app_config')
        ? (app_config()['app']['allowed_email_domains'] ?? [])
        : ['bicol-u.edu.ph'];
    $allowedDomains = array_values(array_filter(array_map('strtolower', $configured)));

    if (!in_array($domain, $allowedDomains, true)) {
        $displayDomains = implode(', ', array_map(static fn(string $item): string => '@' . $item, $allowedDomains));
        throw new ValidationException([['field' => 'email', 'message' => "Only official email addresses ({$displayDomains}) are allowed. Replace the address with your official University email and try again."]]);
    }

    return $email;
}

function validate_person_name(array $data, string $field, int $minBytes = 2, int $maxBytes = 255): string
{
    $raw = array_key_exists($field, $data) ? (string) $data[$field] : '';
    $name = normalize_person_name($raw);

    if ($name === '') {
        $labels = ['firstName' => 'First name', 'lastName' => 'Last name', 'middleName' => 'Middle name'];
        $label = $labels[$field] ?? 'Name';
        throw new ValidationException([['field' => $field, 'message' => "{$label} is required. Enter at least two letters, then try again."]]);
    }

    if (!preg_match('/^(?=.*\p{L})[\p{L}\s\'’\-\.]+$/u', $name)) {
        throw new ValidationException([['field' => $field, 'message' => 'Use letters, spaces, hyphens, apostrophes, or periods only; remove other characters and try again.']]);
    }

    $length = strlen($name);
    if ($length < $minBytes || $length > $maxBytes) {
        throw new ValidationException([['field' => $field, 'message' => "Use a name between {$minBytes} and {$maxBytes} bytes; shorten or complete the name, then try again."]]);
    }

    return $name;
}

function validate_optional_person_name(array $data, string $field, int $minBytes = 2, int $maxBytes = 255): ?string
{
    if (!array_key_exists($field, $data) || trim((string) $data[$field]) === '') {
        return null;
    }

    return validate_person_name($data, $field, $minBytes, $maxBytes);
}

/**
 * Optional name prefix or suffix such as "Dr.", "Jr.", "III" or "DMD, PhD":
 * letters with periods, commas, apostrophes, hyphens and spaces. Digits and
 * values without a letter (for example "Dr2" or "123") are rejected.
 */
function validate_optional_name_affix(array $data, string $field): ?string
{
    $value = validate_optional_string($data, $field, 1, 50);
    if ($value === null) {
        return null;
    }
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    if (!preg_match('/^(?=.*\p{L})[\p{L}\s.,\'’\-]+$/u', $value)) {
        $label = $field === 'prefix' ? 'Prefix' : 'Suffix';
        throw new ValidationException([['field' => $field, 'message' => "{$label} can only contain letters, periods, commas, apostrophes, and hyphens."]]);
    }
    return normalize_name_affix($value, $field);
}

/** Fixes the casing of known titles and degrees only; unknown words stay as typed. */
function normalize_name_affix(string $value, string $field = 'suffix'): string
{
    $words = [
        'dr' => 'Dr.', 'dra' => 'Dra.', 'mr' => 'Mr.', 'mrs' => 'Mrs.', 'prof' => 'Prof.', 'engr' => 'Engr.', 'atty' => 'Atty.',
        'jr' => 'Jr.', 'sr' => 'Sr.', 'ii' => 'II', 'iii' => 'III', 'iv' => 'IV', 'v' => 'V',
        'dmd' => 'DMD', 'md' => 'MD', 'phd' => 'PhD', 'msc' => 'MSc', 'mph' => 'MPH', 'ma' => 'MA', 'rn' => 'RN',
        // "Ms" is a title in a prefix but the MS degree in a suffix.
        'ms' => $field === 'prefix' ? 'Ms.' : 'MS',
    ];
    $parts = preg_split('/([,\s]+)/u', $value, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$value];
    foreach ($parts as $i => $part) {
        $key = mb_strtolower(rtrim($part, '.'), 'UTF-8');
        if ($i % 2 === 0 && isset($words[$key])) {
            $parts[$i] = $words[$key];
        }
    }
    return implode('', $parts);
}

/** Trims and collapses inner whitespace to single spaces; optionally upper-cases. */
function normalize_spaces(?string $value, bool $upper = false): ?string
{
    if ($value === null) {
        return null;
    }
    $value = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    return $upper ? mb_strtoupper($value, 'UTF-8') : $value;
}

/** Sex is stored as 'M' or 'F'; blank means not given. */
function validate_optional_sex(array $data, string $field): ?string
{
    $value = strtolower(trim((string) ($data[$field] ?? '')));
    if ($value === '') {
        return null;
    }
    if ($value === 'm' || $value === 'male') {
        return 'M';
    }
    if ($value === 'f' || $value === 'female') {
        return 'F';
    }
    throw new ValidationException([['field' => $field, 'message' => 'Choose Male or Female from the list, then try again.']]);
}

/** Optional Philippine mobile number, stored as 09XXXXXXXXX. */
function validate_optional_ph_mobile(array $data, string $field): ?string
{
    $value = preg_replace('/[\s\-()]/', '', trim((string) ($data[$field] ?? ''))) ?? '';
    if ($value === '') {
        return null;
    }
    if (!preg_match('/^(09|\+639|639)\d{9}$/', $value)) {
        throw new ValidationException([['field' => $field, 'message' => 'Enter a Philippine mobile number such as 0917 123 4567. Check the digits and try again.']]);
    }
    return '09' . substr($value, -9);
}

function normalize_person_name(string $value): string
{
    $collapsed = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    if ($collapsed === '') {
        return '';
    }

    $particles = array_fill_keys(
        ['da', 'de', 'del', 'di', 'dos', 'du', 'la', 'las', 'le', 'los', 'van', 'von', 'y'],
        true
    );
    $suffixes = [
        'jr' => 'Jr.', 'jr.' => 'Jr.', 'sr' => 'Sr.', 'sr.' => 'Sr.',
        'ii' => 'II', 'iii' => 'III', 'iv' => 'IV', 'v' => 'V',
    ];

    $words = explode(' ', $collapsed);
    foreach ($words as $index => &$word) {
        $lowerWord = mb_strtolower($word, 'UTF-8');
        if (isset($suffixes[$lowerWord])) {
            $word = $suffixes[$lowerWord];
            continue;
        }
        if ($index > 0 && isset($particles[$lowerWord])) {
            $word = $lowerWord;
            continue;
        }

        $parts = preg_split("/([\\-'’])/u", $lowerWord, -1, PREG_SPLIT_DELIM_CAPTURE);
        if ($parts === false) {
            $parts = [$lowerWord];
        }
        foreach ($parts as &$part) {
            if ($part === '' || preg_match("/^[\\-'’]$/u", $part)) {
                continue;
            }
            $part = mb_convert_case($part, MB_CASE_TITLE, 'UTF-8');
            if (preg_match('/^Mc\p{L}/u', $part)) {
                $prefix = mb_substr($part, 0, 2, 'UTF-8');
                $third = mb_strtoupper(mb_substr($part, 2, 1, 'UTF-8'), 'UTF-8');
                $part = $prefix . $third . mb_substr($part, 3, null, 'UTF-8');
            }
        }
        unset($part);
        $word = implode('', $parts);
    }
    unset($word);

    return implode(' ', $words);
}

function validate_phone_number(array $data, string $field): string
{
    $val = validate_required_string($data, $field, 7, 20);
    if (!preg_match('/^[0-9\+\-\s\(\)]+$/', $val) || preg_match('/[a-zA-Z]/', $val)) {
        throw new ValidationException([['field' => $field, 'message' => 'Use digits with an optional +, hyphen, space, or parentheses. Remove letters and try again.']]);
    }
    return $val;
}

function validate_optional_phone_number(array $data, string $field): ?string
{
    $val = validate_optional_string($data, $field, 7, 20);
    if ($val === null) {
        return null;
    }
    if (!preg_match('/^[0-9\+\-\s\(\)]+$/', $val) || preg_match('/[a-zA-Z]/', $val)) {
        throw new ValidationException([['field' => $field, 'message' => 'Use digits with an optional +, hyphen, space, or parentheses. Remove letters and try again.']]);
    }
    return $val;
}

function validate_numeric_string(array $data, string $field, int $minLen = 1, int $maxLen = 50): string
{
    $val = validate_required_string($data, $field, $minLen, $maxLen);
    if (!preg_match('/^[0-9]+$/', $val)) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . ' must contain digits only. Remove spaces or symbols and try again.']]);
    }
    return $val;
}

function validate_optional_numeric_string(array $data, string $field, int $minLen = 1, int $maxLen = 50): ?string
{
    $val = validate_optional_string($data, $field, $minLen, $maxLen);
    if ($val === null) {
        return null;
    }
    if (!preg_match('/^[0-9]+$/', $val)) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . ' must contain digits only. Remove spaces or symbols and try again.']]);
    }
    return $val;
}


function validate_required_string(array $data, string $field, int $minBytes, int $maxBytes): string
{
    if (!array_key_exists($field, $data)) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . ' is required. Enter a value and try again.']]);
    }

    if (!is_string($data[$field])) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . ' has an invalid value. Re-enter it and try again.']]);
    }

    $value = $data[$field];

    if (!mb_check_encoding($value, 'UTF-8')) {
        throw new ValidationException([['field' => $field, 'message' => 'This value contains unsupported characters. Re-enter it using standard text characters.']]);
    }

    reject_control_chars($value, $field);

    $cleaned = trim($value);

    $len = strlen($cleaned);

    if ($len < $minBytes) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . " must be at least $minBytes characters. Add more characters and try again."]]);
    }

    if ($len > $maxBytes) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . " must be no more than $maxBytes characters. Shorten it and try again."]]);
    }

    return $cleaned;
}

function validate_optional_string(array $data, string $field, int $minBytes, int $maxBytes): ?string
{
    if (!array_key_exists($field, $data)) {
        return null;
    }

    if (!is_string($data[$field])) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . ' has an invalid value. Re-enter it and try again.']]);
    }

    $value = $data[$field];

    if ($value === '') {
        return null;
    }

    if (!mb_check_encoding($value, 'UTF-8')) {
        throw new ValidationException([['field' => $field, 'message' => 'This value contains unsupported characters. Re-enter it using standard text characters.']]);
    }

    reject_control_chars($value, $field);

    $cleaned = trim($value);

    $len = strlen($cleaned);

    if ($len < $minBytes) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . " must be at least $minBytes characters. Add more characters and try again."]]);
    }

    if ($len > $maxBytes) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . " must be no more than $maxBytes characters. Shorten it and try again."]]);
    }

    return $cleaned;
}

function validate_enum(array $data, string $field, array $allowedValues): string
{
    $value = validate_required_string($data, $field, 1, 255);

    if (!in_array($value, $allowedValues, true)) {
        throw new ValidationException([['field' => $field, 'message' => 'Choose one of the available options, then try again.']]);
    }

    return $value;
}

function validate_int(array $data, string $field, int $min, int $max): int
{
    if (!array_key_exists($field, $data)) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . ' is required. Enter a value and try again.']]);
    }

    if (!is_int($data[$field])) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . ' must be a whole number. Enter a whole number and try again.']]);
    }

    if ($data[$field] < $min || $data[$field] > $max) {
        throw new ValidationException([['field' => $field, 'message' => validation_field_label($field) . " must be between $min and $max. Adjust the value and try again."]]);
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

    $characterCount = mb_strlen($password, 'UTF-8');

    if ($characterCount < 8) {
        $errors[] = ['field' => 'password', 'message' => 'Must be at least 8 characters.'];
    }

    if ($characterCount > 32) {
        $errors[] = ['field' => 'password', 'message' => 'Use at most 32 characters.'];
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
