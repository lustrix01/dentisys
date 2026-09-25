<?php
declare(strict_types=1);
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/account_identity.php';

$parts = account_identity_name_parts(['prefix' => 'Dr.', 'firstName' => 'Ana Maria', 'middleName' => 'De Leon', 'lastName' => 'Dela Cruz', 'suffix' => 'III']);
if (account_identity_composed_name($parts) !== 'Dr. Ana Maria De Leon Dela Cruz III') throw new RuntimeException('Compound names were changed.');
if (account_identity_name_parts(['name' => 'Ambiguous Legacy Name']) !== null) throw new RuntimeException('Legacy display name was parsed.');
$parts = account_identity_name_parts(['prefix' => '', 'firstName' => 'Ana', 'middleName' => '', 'lastName' => 'Dela Cruz', 'suffix' => '']);
if ($parts['prefix'] !== null || $parts['middleName'] !== null || $parts['suffix'] !== null) throw new RuntimeException('Optional blanks must become null.');
foreach ([['prefix' => str_repeat('x', 51)], ['suffix' => []], ['firstName' => '']] as $invalid) {
    $rejected = false;
    try { account_identity_name_parts(array_merge(['firstName' => 'Ana', 'lastName' => 'Dela Cruz'], $invalid)); }
    catch (ValidationException) { $rejected = true; }
    if (!$rejected) throw new RuntimeException('Invalid name part accepted.');
}
echo "PASS: five-part names preserve boundaries, optional values, and validation.\n";
