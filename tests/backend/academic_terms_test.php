<?php

declare(strict_types=1);
require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/attendance_sessions.php';
require_once __DIR__ . '/../../backend/app/student_biometrics.php';

function term_expect(bool $ok, string $label): void
{
    if (!$ok) { fwrite(STDERR, "FAIL: {$label}\n"); exit(1); }
}
function term_invalid(callable $operation, string $field): void
{
    try { $operation(); term_expect(false, 'Expected validation for ' . $field); }
    catch (ValidationException $e) { term_expect(in_array($field, array_column($e->getErrors(), 'field'), true), 'Field error: ' . $field); }
}
// A deterministic repository fake exercises the server operations without a DB.
// Actual constraints, grants, transactions and HTTP permissions are covered by
// academic_terms_integration.php against disposable PostgreSQL.
class TermTestPDO extends PDO
{
    public array $terms = [];
    public array $classes = [];
    public array $profiles = [];
    public array $audits = [];
    public function __construct() {}
    public function prepare(string $query, array $options = []): PDOStatement|false { return new TermTestStatement($this, $query); }
    public function query(string $query, ?int $fetchMode = null, mixed ...$args): PDOStatement|false
    {
        $stmt = $this->prepare($query); $stmt->execute(); return $stmt;
    }
}
class TermTestStatement extends PDOStatement
{
    private array $rows = [];
    public function __construct(private TermTestPDO $db, private string $sql) {}
    public function execute(?array $params = null): bool
    {
        $p = $params ?? [];
        if (str_contains($this->sql, 'SELECT * FROM academic_terms')) {
            $this->rows = array_values(array_filter($this->db->terms, static fn(array $t): bool => $p === [] || (int) $t['id'] === (int) $p[0]));
            usort($this->rows, static fn(array $a, array $b): int => strcmp($b['school_year'], $a['school_year']) ?: strcmp($a['start_date'], $b['start_date']));
        } elseif (str_contains($this->sql, 'FROM system_settings')) {
            $this->rows = [['setting_value' => '"2026-2027"']];
        } elseif (str_contains($this->sql, 'FROM enrollments e')) {
            $this->rows = array_values(array_filter($this->db->classes, static fn(array $c): bool => (int) $c['student_id'] === (int) $p[0]));
        } elseif (str_contains($this->sql, 'SELECT semester FROM class_sections')) {
            $this->rows = array_values(array_filter($this->db->classes, static fn(array $c): bool => $c['school_year'] === $p[0]));
            $this->rows = array_map(static fn(array $c): array => ['semester' => $c['semester']], $this->rows);
        } elseif (str_contains($this->sql, 'SELECT * FROM biometric_profiles')) {
            $this->rows = array_values(array_filter($this->db->profiles, static fn(array $r): bool => in_array($r['enrollment_status'], ['active', 'enrolling'], true) && $r['reference_expires_on'] >= $p[0]));
        } elseif (str_contains($this->sql, 'INSERT INTO academic_terms')) {
            $id = count($this->db->terms) + 1;
            $this->db->terms[] = ['id' => $id, 'school_year' => $p[0], 'semester' => $p[1], 'start_date' => $p[2], 'end_date' => $p[3]];
            $this->rows = [['id' => $id]];
        } elseif (str_contains($this->sql, 'UPDATE academic_terms')) {
            foreach ($this->db->terms as &$term) if ((int) $term['id'] === (int) $p[3]) { $term['start_date'] = $p[0]; $term['end_date'] = $p[1]; }
        } elseif (str_contains($this->sql, 'UPDATE biometric_profiles')) {
            foreach ($this->db->profiles as &$profile) if ($profile['profile_id'] === $p[3]) {
                $profile['reference_expires_on'] = $p[0]; $profile['reference_term_id'] = $p[1]; $profile['reference_cs_id'] = $p[2];
            }
        } elseif (str_contains($this->sql, 'DELETE FROM academic_terms')) {
            $this->db->terms = array_values(array_filter($this->db->terms, static fn(array $t): bool => (int) $t['id'] !== (int) $p[0]));
        } else { throw new RuntimeException('Unexpected test query: ' . $this->sql); }
        return true;
    }
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array { return $mode === PDO::FETCH_COLUMN ? array_column($this->rows, array_key_first($this->rows[0] ?? [])) : $this->rows; }
    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $orientation = PDO::FETCH_ORI_NEXT, int $offset = 0): mixed { return $this->rows[0] ?? false; }
    public function fetchColumn(int $column = 0): mixed { return array_values($this->rows[0] ?? [])[$column] ?? false; }
}
function audit_record_action(PDO $pdo, array $config, array $actor, string $module, string $action, ?string $type, ?string $id, string $description, array $extra = []): void
{
    term_expect($module === 'settings', 'Terms use Settings audit module');
    $pdo->audits[] = $action;
}
$db = new TermTestPDO();
$config = app_config(['APP_ENV' => 'test', 'APP_TIMEZONE' => 'Asia/Manila']);
$actor = ['user_id' => 1];
$year = (int) date('Y') + 2;
$sy = $year . '-' . ($year + 1);
$input = ['schoolYear' => $sy, 'semester' => '1ST', 'startDate' => $year . '-08-01', 'endDate' => $year . '-12-31'];
$created = academic_term_save($db, $config, $actor, $input);
term_expect($created['id'] === 1, 'Create term');
term_invalid(fn() => academic_term_validate($input, $db->terms), 'semester');
term_invalid(fn() => academic_term_validate($input + ['id' => 2], $db->terms), 'startDate');
term_invalid(fn() => academic_term_validate(array_merge($input, ['semester' => '2ND', 'startDate' => $year . '-12-31', 'endDate' => ($year + 1) . '-01-31']), $db->terms), 'startDate');
term_invalid(fn() => academic_term_validate(array_merge($input, ['endDate' => $input['startDate']]), []), 'endDate');
term_invalid(fn() => academic_term_validate(array_merge($input, ['startDate' => $year . '-02-30']), []), 'startDate');
term_invalid(fn() => academic_term_validate(array_merge($input, ['schoolYear' => '2026-2028']), []), 'schoolYear');
term_expect(academic_term_shift_year('2024-02-29') === '2025-02-28', 'Leap day clamps to February 28');
term_expect(academic_term_shift_year('2023-02-28') === '2024-02-28', 'Ordinary dates shift exactly one year');
$class = ['cs_id' => 11, 'student_id' => 7, 'school_year' => $sy, 'semester' => '1st Semester', 'term_start_date' => $year . '-01-01', 'term_end_date' => $year . '-10-01'];
term_expect(academic_resolve_class_term_dates($class, $db->terms)['endDate'] === $input['endDate'], 'Dean dates override class dates');
term_expect(academic_resolve_class_term_dates($class, [])['endDate'] === $class['term_end_date'], 'Class dates are fallback only without a Dean term');
$db->classes = [$class];
term_invalid(fn() => academic_term_delete($db, $config, $actor, 1), 'id');
term_invalid(fn() => academic_term_for_class_create($db, ['schoolYear' => '2026-2027', 'semester' => '2ND']), 'academicTermId');
term_invalid(fn() => academic_term_for_class_create($db, ['academicTermId' => 1]), 'schoolYear');
term_expect(student_biometric_reference_expiry($db, 7) === $input['endDate'], 'Biometrics use resolved latest end');
$db->profiles = [['profile_id' => 8, 'student_id' => 7, 'enrollment_status' => 'active', 'reference_expires_on' => $input['endDate'], 'reference_term_id' => 1, 'reference_cs_id' => 11]];
$newEnd = ($year + 1) . '-01-15';
academic_term_save($db, $config, $actor, array_merge($input, ['id' => 1, 'endDate' => $newEnd]));
term_expect($db->profiles[0]['reference_expires_on'] === $newEnd, 'Unexpired enrollment follows a changed term end');
$db->profiles[0]['reference_term_id'] = null;
$db->profiles[0]['reference_cs_id'] = null;
academic_term_save($db, $config, $actor, array_merge($input, ['id' => 1]));
term_expect($db->profiles[0]['reference_expires_on'] === $input['endDate'], 'Legacy enrollment source is inferred from its stored resolved end');
$laterClass = $class;
$laterClass['cs_id'] = 12;
$laterClass['school_year'] = ($year + 1) . '-' . ($year + 2);
$laterClass['term_end_date'] = ($year + 1) . '-06-30';
$db->classes[] = $laterClass;
academic_term_save($db, $config, $actor, array_merge($input, ['id' => 1, 'endDate' => ($year + 1) . '-02-01']));
term_expect($db->profiles[0]['reference_expires_on'] === $laterClass['term_end_date'] && $db->profiles[0]['reference_term_id'] === null, 'Propagation retains the latest resolved end when another active class ends later');
$db->classes = [$class];
$db->terms[0]['end_date'] = '2020-12-31';
term_expect(student_biometric_expiry_due($db, 7, '2099-12-31', '2026-10-10'), 'Sweep resolves ended Dean dates despite stale stored expiry');
term_expect(!student_biometric_expiry_due($db, 7, '2020-12-31', '2020-12-31'), 'An enrollment remains valid on its end calendar date');
try { student_biometric_reference_expiry($db, 7); term_expect(false, 'Ended term must refuse enrollment'); }
catch (StudentBiometricException $e) { term_expect($e->getMessage() === 'This term has ended.' && $e->errorCode === 'biometric_term_ended', 'Clear ended-term message uses a distinct code from expired enrollment'); }
$db->terms = [];
$db->classes[0]['term_end_date'] = null;
try { student_biometric_reference_expiry($db, 7); term_expect(false, 'Missing dates must refuse enrollment'); }
catch (StudentBiometricException $e) { term_expect(str_contains($e->getMessage(), '1ST ' . $sy), 'Missing-date message names the term'); }
$db->classes = [];
$db->terms = [['id' => 1, 'school_year' => '2023-2024', 'semester' => '1ST', 'start_date' => '2023-08-01', 'end_date' => '2024-02-29']];
$result = academic_terms_copy_year($db, $config, $actor);
term_expect($result['created'] === 1 && $db->terms[1]['end_date'] === '2025-02-28', 'Copy year includes leap-day clamp');
term_expect(in_array('academic_terms_copied', $db->audits, true), 'Copy is audited');
academic_term_delete($db, $config, $actor, 2);
term_expect(in_array('academic_term_deleted', $db->audits, true), 'Unused deletion is audited');
$db->terms = [['id' => 1, 'school_year' => '2023-2024', 'semester' => '1ST', 'start_date' => '2023-08-01', 'end_date' => '2024-02-29']];
$db->classes = [['cs_id' => 12, 'student_id' => 7, 'school_year' => '2024-2025', 'semester' => '1ST', 'term_start_date' => '2098-01-01', 'term_end_date' => '2099-12-31']];
$db->profiles = [['profile_id' => 8, 'student_id' => 7, 'enrollment_status' => 'active', 'reference_expires_on' => '2099-12-31', 'reference_term_id' => null, 'reference_cs_id' => null]];
term_invalid(fn() => academic_terms_copy_year($db, $config, $actor), 'endDate');
term_expect(count($db->terms) === 1 && $db->profiles[0]['reference_expires_on'] === '2099-12-31', 'Copy cannot bypass expiry confirmation');
// Joining later classes leaves an existing reference unchanged until a Dean edit.
$expiryDb = new TermTestPDO();
$summerInput = ['id' => 2, 'schoolYear' => $sy, 'semester' => 'Summer', 'startDate' => ($year + 1) . '-05-01', 'endDate' => ($year + 1) . '-07-31'];
$expiryDb->terms = [
    ['id' => 1, 'school_year' => $sy, 'semester' => '1ST', 'start_date' => $input['startDate'], 'end_date' => $input['endDate']],
    ['id' => 2, 'school_year' => $sy, 'semester' => 'Summer', 'start_date' => $summerInput['startDate'], 'end_date' => $summerInput['endDate']],
];
$expiryDb->classes = [$class, ['cs_id' => 12, 'student_id' => 7, 'school_year' => $sy, 'semester' => 'SUMMER']];
$expiryDb->profiles = [
    ['profile_id' => 8, 'student_id' => 7, 'enrollment_status' => 'active', 'reference_expires_on' => $input['endDate'], 'reference_term_id' => 1, 'reference_cs_id' => 11],
    ['profile_id' => 9, 'student_id' => 8, 'enrollment_status' => 'active', 'reference_expires_on' => $input['endDate'], 'reference_term_id' => 1, 'reference_cs_id' => 21],
];
term_expect(student_biometric_expiry_due($expiryDb, 7, $input['endDate'], ($year + 1) . '-01-01'), 'Joining Summer alone does not extend the stored enrollment');
$summerExtended = ($year + 1) . '-08-31';
academic_term_save($expiryDb, $config, $actor, array_merge($summerInput, ['endDate' => $summerExtended]));
term_expect($expiryDb->profiles[0]['reference_expires_on'] === $summerExtended, 'Editing another active-class term extends an unexpired reference from 1ST');
term_expect($expiryDb->profiles[0]['reference_term_id'] === 2 && $expiryDb->profiles[0]['reference_cs_id'] === 12, 'Extension moves provenance to Summer and its class');
term_expect(!student_biometric_expiry_due($expiryDb, 7, $expiryDb->profiles[0]['reference_expires_on'], ($year + 1) . '-01-01'), 'Propagated extension prevents early expiry at the old stored date');
term_expect($expiryDb->profiles[1]['reference_expires_on'] === $input['endDate'], 'Editing Summer leaves a Student without a Summer class unchanged');
$expiryDb->terms[] = ['id' => 3, 'school_year' => ($year + 1) . '-' . ($year + 2), 'semester' => '1ST', 'start_date' => ($year + 1) . '-09-01', 'end_date' => ($year + 1) . '-12-31'];
$expiryDb->classes[] = ['cs_id' => 13, 'student_id' => 7, 'school_year' => ($year + 1) . '-' . ($year + 2), 'semester' => '1ST'];
term_expect($expiryDb->profiles[0]['reference_expires_on'] === $summerExtended, 'Joining the next year alone keeps the Summer expiry');
academic_term_save($expiryDb, $config, $actor, array_merge($summerInput, ['endDate' => ($year + 1) . '-06-30']));
term_expect($expiryDb->profiles[0]['reference_expires_on'] === ($year + 1) . '-12-31', 'Shortening the source term keeps the later active term end');
term_expect($expiryDb->profiles[0]['reference_term_id'] === 3 && $expiryDb->profiles[0]['reference_cs_id'] === 13, 'Shortening moves provenance to the remaining latest term and class');
// A start-date edit also refreshes profiles for active classes in that term.
$expiryDb->profiles[0]['reference_expires_on'] = $input['endDate'];
$expiryDb->profiles[0]['reference_term_id'] = 1;
$expiryDb->profiles[0]['reference_cs_id'] = 11;
academic_term_save($expiryDb, $config, $actor, array_merge($summerInput, ['startDate' => ($year + 1) . '-05-02', 'endDate' => ($year + 1) . '-06-30']));
term_expect($expiryDb->profiles[0]['reference_expires_on'] === ($year + 1) . '-12-31', 'Changing term dates refreshes the latest resolved expiry even when its end is unchanged');

$todayDb = new TermTestPDO();
$today = app_local_date($config, attendance_session_now_utc());
$todayDate = new DateTimeImmutable($today);
$todayInput = ['id' => 1, 'schoolYear' => $sy, 'semester' => '1ST', 'startDate' => $todayDate->modify('-90 days')->format('Y-m-d'), 'endDate' => $today];
$futureEnd = $todayDate->modify('+90 days')->format('Y-m-d');
$todayDb->terms = [['id' => 1, 'school_year' => $sy, 'semester' => '1ST', 'start_date' => $todayInput['startDate'], 'end_date' => $futureEnd]];
$todayDb->classes = [$class];
$todayDb->profiles = [['profile_id' => 8, 'student_id' => 7, 'enrollment_status' => 'active', 'reference_expires_on' => $futureEnd, 'reference_term_id' => 1, 'reference_cs_id' => 11]];
$todayPreview = academic_term_save($todayDb, $config, $actor, $todayInput, true);
term_expect($todayPreview === ['confirmationRequired' => false, 'expiringEnrollments' => 0], 'End date today requires no confirmation and counts zero expiring enrollments');
$todaySaved = academic_term_save($todayDb, $config, $actor, $todayInput);
term_expect(!$todaySaved['confirmationRequired'] && $todayDb->profiles[0]['reference_expires_on'] === $today, 'Today can be saved without a confirmation count');
term_expect(!student_biometric_expiry_due($todayDb, 7, $today, $today), 'Saving today preserves validity through the end of today');
$reminderTerms = [['id' => 1, 'school_year' => '2026-2027', 'semester' => 'Summer', 'start_date' => '2027-05-01', 'end_date' => '2027-06-01']];
term_expect(academic_next_term_reminder($reminderTerms, '2027-05-18')['schoolYear'] === '2027-2028', 'Reminder includes 14-day boundary and next-year transition');
term_expect(academic_next_term_reminder($reminderTerms, '2027-05-17') === null, 'No reminder more than 14 days ahead');
$reminderTerms[] = ['id' => 2, 'school_year' => '2027-2028', 'semester' => '1ST', 'start_date' => '2027-08-01', 'end_date' => '2027-12-31'];
term_expect(academic_next_term_reminder($reminderTerms, '2027-06-01') === null, 'No reminder when following term exists');
echo "PASS: academic terms resolution, validation, lifecycle, copy, class eligibility, biometrics and reminder tests.\n";
