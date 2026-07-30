<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/jwt.php';

function assert_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: $label\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

function assert_throws(callable $fn, string $needle, string $label): void
{
    try {
        $fn();
        fwrite(STDERR, "FAIL: $label -- expected exception containing '$needle'\n");
        exit(1);
    } catch (\Throwable $e) {
        if (!str_contains($e->getMessage(), $needle)) {
            if (!str_contains(get_class($e), $needle)) {
                fwrite(STDERR, "FAIL: $label -- exception message '" . $e->getMessage() . "' does not contain '$needle'\n");
                exit(1);
            }
        }
    }
    echo "PASS: $label\n";
}

$key = str_repeat('A', 32);
$shortKey = str_repeat('B', 31);
$claims = [
    'sub' => 42,
    'role' => 'admin',
    'sid' => '550e8400-e29b-41d4-a716-446655440000',
    'jti' => 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    'token_type' => 'access',
    'token_version' => 0,
    'iat' => 1000000000,
    'exp' => 2000000000,
];

$enrollmentClaims = [
    'sub' => 42,
    'jti' => 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7',
    'token_type' => 'mfa_enrollment',
    'iat' => 1000000000,
    'exp' => 2000000000,
];

$challengeClaims = [
    'sub' => 42,
    'jti' => 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
    'token_type' => 'mfa_challenge',
    'iat' => 1000000000,
    'exp' => 2000000000,
];

$clock = fn(): int => 1500000000;

echo "=== JWT Unit Tests ===\n\n";

// Known-answer test: encode with known claims and verify roundtrip
$knownToken = jwt_encode($claims, $key);
$decoded = jwt_decode($knownToken, $key, 'access', $clock);
assert_same(42, $decoded['sub'], 'KA: sub matches');
assert_same('admin', $decoded['role'], 'KA: role matches');
assert_same('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', $decoded['jti'], 'KA: jti matches');
echo "\n";

// Roundtrip
$token = jwt_encode($claims, $key);
$decoded = jwt_decode($token, $key, 'access', $clock);
assert_same(42, $decoded['sub'], 'Roundtrip: sub');
assert_same('admin', $decoded['role'], 'Roundtrip: role');
assert_same('550e8400-e29b-41d4-a716-446655440000', $decoded['sid'], 'Roundtrip: sid');
assert_same('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', $decoded['jti'], 'Roundtrip: jti');
assert_same(0, $decoded['token_version'], 'Roundtrip: token_version');

// Type-specific decode
$enrToken = jwt_encode($enrollmentClaims, $key);
$chToken = jwt_encode($challengeClaims, $key);
jwt_decode($enrToken, $key, 'mfa_enrollment', $clock);
assert_same(true, true, 'Enrollment decode succeeds with correct type');
jwt_decode($chToken, $key, 'mfa_challenge', $clock);
assert_same(true, true, 'Challenge decode succeeds with correct type');
assert_throws(fn() => jwt_decode($enrToken, $key, 'access', $clock), 'Expected token_type', 'Enrollment token rejected for access type');
assert_throws(fn() => jwt_decode($enrToken, $key, 'mfa_challenge', $clock), 'Expected token_type', 'Enrollment token rejected for challenge type');

// Short key
assert_throws(fn() => jwt_encode($claims, $shortKey), 'at least 32 bytes', 'Encode rejects short key');
assert_throws(fn() => jwt_decode($token, $shortKey, 'access', $clock), 'at least 32 bytes', 'Decode rejects short key');

// Tampered signature (swap two Base64URL chars in signature segment to keep valid encoding)
$tampered = substr_replace($token, 'A', -2, 1);
assert_throws(fn() => jwt_decode($tampered, $key, 'access', $clock), 'signature verification failed', 'Tampered signature rejected');

// alg none
$noneHeader = base64url_encode(json_encode(['alg' => 'none', 'typ' => 'JWT']));
$noneClaims = base64url_encode(json_encode(['sub' => 42]));
$noneSig = base64url_encode('garbage');
$noneToken = "$noneHeader.$noneClaims.$noneSig";
assert_throws(fn() => jwt_decode($noneToken, $key, 'access', $clock), 'HS256', 'alg none rejected');

// Wrong alg
$wrongAlgHeader = base64url_encode(json_encode(['alg' => 'HS384', 'typ' => 'JWT']));
$wrongAlgToken = "$wrongAlgHeader.eyJzdWIiOjQyfQ.sig";
assert_throws(fn() => jwt_decode($wrongAlgToken, $key, 'access', $clock), 'HS256', 'Wrong alg rejected');

// Wrong header typ
$wrongTypHeader = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWE']));
$wrongTypToken = "$wrongTypHeader.eyJzdWIiOjQyfQ.test-sig";
assert_throws(fn() => jwt_decode($wrongTypToken, $key, 'access', $clock), 'JWT', 'Wrong header typ rejected');

// Segment count
assert_throws(fn() => jwt_decode('a.b', $key, 'access', $clock), 'exactly 3 segments', 'Two segments rejected');
assert_throws(fn() => jwt_decode('a.b.c.d', $key, 'access', $clock), 'exactly 3 segments', 'Four segments rejected');
assert_throws(fn() => jwt_decode('', $key, 'access', $clock), 'exactly 3 segments', 'Empty token rejected');

// Empty segment
assert_throws(fn() => jwt_decode('.b.c', $key, 'access', $clock), 'must not be empty', 'Empty header segment rejected');
assert_throws(fn() => jwt_decode('a..c', $key, 'access', $clock), 'must not be empty', 'Empty claims segment rejected');
assert_throws(fn() => jwt_decode('a.b.', $key, 'access', $clock), 'must not be empty', 'Empty signature segment rejected');

// Invalid Base64URL characters
assert_throws(fn() => base64url_decode('a=='), 'invalid characters', 'Padding in segment rejected');

// Modulo 4 == 1 length
assert_throws(fn() => base64url_decode('aaaaa'), 'modulo 4', 'Length mod 4 = 1 rejected');

// Non-canonical encoding
$decodedBytes = json_encode(['sub' => 42]);
$nonCanonical = rtrim(strtr(base64_encode($decodedBytes), '+/', '-_'), '=');
$nonCanonical = str_replace('42', '43', base64_encode($decodedBytes));
$nonCanonical = rtrim(strtr($nonCanonical, '+/', '-_'), '=');
$nonCanonicalHeader = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
$fakeToken = "$nonCanonicalHeader.$nonCanonical." . base64url_encode(str_repeat('A', 32));
assert_throws(fn() => jwt_decode($fakeToken, $key, 'access', $clock), 'signature', 'Non-canonical rejected (signature fails)');

// Expired token (exp <= now)
$expiredClaims = $claims;
$expiredClaims['exp'] = 999;
assert_throws(fn() => jwt_decode(jwt_encode($expiredClaims, $key), $key, 'access', fn() => 1000), 'has expired', 'Expired token rejected');

// Future iat
$futureClaims = $claims;
$futureClaims['iat'] = 2000;
assert_throws(fn() => jwt_decode(jwt_encode($futureClaims, $key), $key, 'access', fn() => 1000), 'too far in the future', 'Future iat rejected');

// Missing claims
foreach (['sub', 'jti', 'iat', 'exp'] as $c) {
    $missing = $claims;
    unset($missing[$c]);
    assert_throws(fn() => jwt_decode(jwt_encode($missing, $key), $key, 'access', $clock), 'Missing', "Missing claim '$c' rejected");
}

// Missing token_type
$missingType = $claims;
unset($missingType['token_type']);
assert_throws(fn() => jwt_decode(jwt_encode($missingType, $key), $key, 'access', $clock), 'Expected token_type', "Missing token_type claim rejected");

// Incorrect claim types
$badSub = $claims;
$badSub['sub'] = 'not_int';
assert_throws(fn() => jwt_decode(jwt_encode($badSub, $key), $key, 'access', $clock), 'positive integer', 'String sub rejected');

$badJti = $claims;
$badJti['jti'] = 'short';
assert_throws(fn() => jwt_decode(jwt_encode($badJti, $key), $key, 'access', $clock), '32 lowercase hex', 'Short jti rejected');

$badJti2 = $claims;
$badJti2['jti'] = 'gggggggggggggggggggggggggggggggg';
assert_throws(fn() => jwt_decode(jwt_encode($badJti2, $key), $key, 'access', $clock), 'hex', 'Non-hex jti rejected');

// Invalid role
$badRole = $claims;
$badRole['role'] = 'student';
assert_throws(fn() => jwt_decode(jwt_encode($badRole, $key), $key, 'access', $clock), 'admin, faculty, secretary', 'Invalid role rejected');

// Invalid SID
$badSid = $claims;
$badSid['sid'] = 'not-a-uuid';
assert_throws(fn() => jwt_decode(jwt_encode($badSid, $key), $key, 'access', $clock), 'UUID', 'Invalid SID rejected');

// JTI generation
$jti = jwt_generate_jti();
assert_same(32, strlen($jti), 'JTI is 32 chars');
assert_same(true, ctype_xdigit($jti), 'JTI is hex');
assert_same(true, strtolower($jti) === $jti, 'JTI is lowercase');

echo "\n=== ALL JWT TESTS PASSED ===\n";
