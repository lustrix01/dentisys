<?php

declare(strict_types=1);

/**
 * DentiSys - Complete Clean Development SQL Seed Generator
 * Database Reset + System Roles + College of Dental Medicine Dataset
 * Configured for 25 Dental Medicine Students
 */

$TOTAL_STUDENTS = 25;

function seed_percentage_for_student(int $studentId): float
{
    if ($studentId === 24) return 68.0;
    if ($studentId === 25) return 60.0;
    if ($studentId >= 21) return 74.0;
    return (float) (78 + (($studentId * 7) % 20));
}

function seed_gwa_from_percentage(float $percentage): float
{
    if ($percentage >= 97) return 1.0;
    if ($percentage >= 94) return 1.25;
    if ($percentage >= 91) return 1.5;
    if ($percentage >= 88) return 1.75;
    if ($percentage >= 85) return 2.0;
    if ($percentage >= 82) return 2.25;
    if ($percentage >= 80) return 2.5;
    if ($percentage >= 78) return 2.75;
    if ($percentage >= 75) return 3.0;
    return 5.0;
}

function seed_ascii_email_part(string $value): string
{
    $ascii = strtr(mb_strtolower($value, 'UTF-8'), [
        'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a',
        'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
        'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o',
        'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
        'ñ' => 'n',
    ]);
    return preg_replace('/[^a-z0-9]+/', '', $ascii) ?: 'student';
}

$adminHash = '$2y$10$0tYRcP7zAjkSDhMCQ15Dk.6JhJs4nmuqIPhyFdWRp3kdphwW4BwV.';      // Admin123!
$facultyHash = '$2y$10$2ZtP1tEJ4.xf/H5K62LjtOAscT82f9Z01GULXkFL4NbJFM1fqAwGC';    // Faculty123!
$secretaryHash = '$2y$10$lg8BDdQrFtEF6LeP/ff5OuSGnP9DSQh/dRXHfa4tieiXLc0YaYenK';  // Secretary123!

$sql = [];
$sql[] = "-- =============================================================================";
$sql[] = "-- DentiSys Clean Development Seed Data — College of Dental Medicine";
$sql[] = "-- Database Reset + Official Credentials + 25 Student Academic Records";
$sql[] = "-- Ready for immediate import into MySQL / MariaDB / phpMyAdmin.";
$sql[] = "-- =============================================================================\n";

$sql[] = "SET NAMES utf8mb4;";
$sql[] = "SET FOREIGN_KEY_CHECKS = 0;\n";

// -----------------------------------------------------------------------------
// SECTION 1: DATABASE RESET
// -----------------------------------------------------------------------------
$sql[] = "-- =============================================================================";
$sql[] = "-- 1. DATABASE RESET (Truncates all tables in safe dependency order)";
$sql[] = "-- =============================================================================";
$tablesToReset = [
    'auth_sessions',
    'security_tokens',
    'audit_events',
    'email_outbox',
    'biometric_profiles',
    'attendance_records',
    'assessment_scores',
    'assessments',
    'enrollments',
    'students',
    'class_sections',
    'courses',
    'user_accounts',
];

foreach ($tablesToReset as $t) {
    $sql[] = "TRUNCATE TABLE {$t};";
}
$sql[] = "";

// -----------------------------------------------------------------------------
// SECTION 2: AUTHENTICATION SEED DATA (System Accounts ONLY)
// -----------------------------------------------------------------------------
$sql[] = "-- =============================================================================";
$sql[] = "-- 2. AUTHENTICATION SEED DATA";
$sql[] = "-- Admin: admin@bicol-u.edu.ph / Admin123!";
$sql[] = "-- Faculty (Primary): faculty@bicol-u.edu.ph / Faculty123!";
$sql[] = "-- Faculty (Department Staff): dr.reyes@bicol-u.edu.ph, dr.cruz@bicol-u.edu.ph, etc. / Faculty123!";
$sql[] = "-- Class Secretary: secretary@bicol-u.edu.ph / Secretary123!";
$sql[] = "-- =============================================================================";

$users = [
    [1, 'admin@bicol-u.edu.ph', $adminHash, 'admin', 'Dean Maria Santos, DMD, PhD', 'Dean of Dental Medicine', 'Active', '2024-01-10 08:00:00.000000', '2024-01-10 08:00:00.000000', null, null],
    [2, 'faculty@bicol-u.edu.ph', $facultyHash, 'faculty', 'Dr. Roberto Santos, DMD', 'Department Chair, Restorative Dentistry', 'Active', '2024-01-15 09:00:00.000000', '2024-01-15 09:00:00.000000', null, null],
    [3, 'dr.reyes@bicol-u.edu.ph', $facultyHash, 'faculty', 'Dr. Angela Reyes, DMD, MSc', 'Associate Professor, Periodontics', 'Active', '2024-01-16 09:00:00.000000', '2024-01-16 09:00:00.000000', null, null],
    [4, 'dr.cruz@bicol-u.edu.ph', $facultyHash, 'faculty', 'Dr. Fernando Cruz, DMD', 'Clinical Instructor, Prosthodontics', 'Active', '2024-01-17 09:00:00.000000', '2024-01-17 09:00:00.000000', null, null],
    [5, 'dr.aquino@bicol-u.edu.ph', $facultyHash, 'faculty', 'Dr. Patricia Aquino, DMD', 'Lecturer, Oral Anatomy', 'Active', '2024-01-18 09:00:00.000000', '2024-01-18 09:00:00.000000', null, null],
    [6, 'dr.torres@bicol-u.edu.ph', $facultyHash, 'faculty', 'Dr. Ramon Torres, DMD', 'Lecturer, Ethics & Practice Management', 'Active', '2024-01-19 09:00:00.000000', '2024-01-19 09:00:00.000000', null, null],
    [7, 'pending.faculty1@bicol-u.edu.ph', $facultyHash, 'faculty', 'Dr. Jessica Mendoza, DMD', 'Applicant Faculty', 'Pending Approval', '2026-07-01 10:00:00.000000', null, null, null],
    [8, 'pending.faculty2@bicol-u.edu.ph', $facultyHash, 'faculty', 'Dr. Gabriel Navarro, DMD', 'Applicant Faculty', 'Pending Approval', '2026-07-02 11:00:00.000000', null, null, null],
    [9, 'secretary@bicol-u.edu.ph', $secretaryHash, 'secretary', 'Bea Alonzo', 'Class Secretary - CLINIC-4B', 'Active', '2024-02-01 08:30:00.000000', '2024-02-01 08:30:00.000000', null, null],
];

foreach ($users as $u) {
    $title = $u[5] ? "'" . addslashes($u[5]) . "'" : "NULL";
    $appAt = $u[8] ? "'" . $u[8] . "'" : "NULL";
    $rejAt = isset($u[9]) && $u[9] ? "'" . $u[9] . "'" : "NULL";
    $disAt = isset($u[10]) && $u[10] ? "'" . $u[10] . "'" : "NULL";
    $sql[] = "INSERT IGNORE INTO user_accounts (user_id, login_email, password_hash, role, display_name, title, status, created_at, approved_at, rejected_at, disabled_at) VALUES ({$u[0]}, '{$u[1]}', '{$u[2]}', '{$u[3]}', '" . addslashes($u[4]) . "', {$title}, '{$u[6]}', '{$u[7]}', {$appAt}, {$rejAt}, {$disAt});";
}
$sql[] = "";

// -----------------------------------------------------------------------------
// SECTION 3: ACADEMIC DATA (Courses & Class Sections)
// -----------------------------------------------------------------------------
$sql[] = "-- =============================================================================";
$sql[] = "-- 3. ACADEMIC DATA (Courses Catalog)";
$sql[] = "-- =============================================================================";
$courses = [
    [1, 'CLIN401', 'Clinical Dentistry I', 4.0, 4, '1ST', 'Comprehensive clinical patient care, restorative procedures, and oral surgery practicum.', 1, '{"quizzes":20,"exams":25,"practicum":40,"attendance":15}'],
    [2, 'CLIN402', 'Clinical Dentistry II', 4.0, 4, '2ND', 'Advanced clinical patient management, crown and bridge, and pediatric dentistry.', 1, '{"quizzes":20,"exams":25,"practicum":40,"attendance":15}'],
    [3, 'CLIN301', 'Prosthodontics I', 3.0, 3, '1ST', 'Complete denture fabrication, impressions, and occlusion principles.', 1, '{"quizzes":25,"exams":30,"practicum":35,"attendance":10}'],
    [4, 'CLIN302', 'Periodontics I', 3.0, 3, '2ND', 'Diagnosis and non-surgical management of periodontal diseases.', 1, '{"quizzes":25,"exams":30,"practicum":35,"attendance":10}'],
    [5, 'ORAL201', 'Oral Anatomy & Histology', 3.0, 2, '1ST', 'Microscopic and macroscopic anatomy of human teeth and supporting structures.', 0, '{"quizzes":30,"exams":50,"practicum":10,"attendance":10}'],
    [6, 'DENT101', 'Dental Orientation & Ethics', 2.0, 1, '1ST', 'Introduction to dental profession, jurisprudence, and ethical codes.', 0, '{"quizzes":35,"exams":55,"practicum":0,"attendance":10}'],
];

foreach ($courses as $c) {
    $sql[] = "INSERT IGNORE INTO courses (course_id, course_code, name, units, year_level, semester, description, is_clinical, grading_config, created_at) VALUES ({$c[0]}, '{$c[1]}', '" . addslashes($c[2]) . "', {$c[3]}, {$c[4]}, '{$c[5]}', '" . addslashes($c[6]) . "', {$c[7]}, '{$c[8]}', NOW(6));";
}
$sql[] = "";

$sql[] = "-- Class Sections (Differentiated by Year Level 1-4 and Blocks A & B)";
$sections = [
    // cs_id, cs_name, course_id, instructor_user_id, secretary_user_id, semester, school_year, year_level, lab_room, lec_room, block, status
    [1, 'DENT-1A', 6, 5, null, '1ST', '2024-2025', 1, 'Dental Orientation Lab 1', 'Room 101', 'A', 'Active', '2024-1ST', '2024-08-15', '2024-12-20'],
    [2, 'DENT-1B', 6, 6, null, '1ST', '2024-2025', 1, 'Dental Orientation Lab 2', 'Room 102', 'B', 'Active', '2024-1ST', '2024-08-15', '2024-12-20'],
    [3, 'ORAL-2A', 5, 5, null, '1ST', '2024-2025', 2, 'Oral Anatomy Lab 1',      'Room 201', 'A', 'Active', '2024-1ST', '2024-08-15', '2024-12-20'],
    [4, 'ORAL-2B', 5, 3, null, '1ST', '2024-2025', 2, 'Oral Anatomy Lab 2',      'Room 202', 'B', 'Active', '2024-1ST', '2024-08-15', '2024-12-20'],
    [5, 'PROSTHO-3A', 3, 4, null, '1ST', '2024-2025', 3, 'Prosthodontics Lab 1',   'Room 301', 'A', 'Active', '2024-1ST', '2024-08-15', '2024-12-20'],
    [6, 'PERIO-3B', 4, 3, null, '2ND', '2024-2025', 3, 'Periodontics Lab 2',     'Room 302', 'B', 'Active', '2024-2ND', '2025-01-10', '2025-05-30'],
    [7, 'CLINIC-4A', 1, 2, null, '1ST', '2024-2025', 4, 'Dental Clinic Lab 1',    'Lecture Hall A', 'A', 'Active', '2024-1ST', '2024-08-15', '2024-12-20'],
    [8, 'CLINIC-4B', 2, 2, 9,    '2ND', '2024-2025', 4, 'Dental Clinic Lab 2',    'Lecture Hall B', 'B', 'Active', '2024-2ND', '2025-01-10', '2025-05-30'],
];

foreach ($sections as $s) {
    $secUser = $s[4] ? $s[4] : "NULL";
    $sql[] = "INSERT IGNORE INTO class_sections (cs_id, cs_name, course_id, instructor_user_id, secretary_user_id, semester, school_year, year_level, lab_room, lec_room, block, status, term_code, term_start_date, term_end_date, created_at) VALUES ({$s[0]}, '{$s[1]}', {$s[2]}, {$s[3]}, {$secUser}, '{$s[5]}', '{$s[6]}', {$s[7]}, '{$s[8]}', '{$s[9]}', '{$s[10]}', '{$s[11]}', '{$s[12]}', '{$s[13]}', '{$s[14]}', NOW(6));";
}
$sql[] = "";

// -----------------------------------------------------------------------------
// SECTION 4: STUDENT RECORDS (Academic Records ONLY - user_id = NULL)
// -----------------------------------------------------------------------------
$sql[] = "-- =============================================================================";
$sql[] = "-- 4. STUDENT RECORDS ({$TOTAL_STUDENTS} Dental Medicine Students - Academic Records ONLY)";
$sql[] = "-- =============================================================================";
$firstNames = ['Aaron', 'Abigail', 'Adrian', 'Aileen', 'Albert', 'Alexander', 'Alyssa', 'Amanda', 'Andrea', 'Andrew', 'Angela', 'Anthony', 'Arlene', 'Arthur', 'Bea', 'Benjamin', 'Bernadette', 'Bryan', 'Camille', 'Carl', 'Carlos', 'Catherine', 'Christian', 'Christine', 'Christopher', 'Claire'];
$lastNames = ['Abad', 'Aguilar', 'Alcantara', 'Aquino', 'Bautista', 'Beltran', 'Castillo', 'Castro', 'Corpuz', 'Cruz', 'De Guzman', 'De Leon', 'Dela Cruz', 'Delos Santos', 'Domingo', 'Enriquez', 'Espiritu', 'Estrella', 'Fernandez', 'Flores', 'Garcia', 'Gonzales', 'Guerrero', 'Gutiérrez', 'Hernandez'];

$studentsData = [];
for ($i = 1; $i <= $TOTAL_STUDENTS; $i++) {
    $fn = $firstNames[($i - 1) % count($firstNames)];
    $ln = $lastNames[($i * 3) % count($lastNames)];
    $mn = $firstNames[($i * 7) % count($firstNames)];
    if ($i === 24) {
        $fn = 'Bea';
        $ln = 'Alonzo';
        $mn = '';
    }
    $sn = sprintf("2024-DENT-%04d", $i);
    $email = seed_ascii_email_part($fn) . '.' . seed_ascii_email_part($ln) . $i . '@bicol-u.edu.ph';
    if ($i === 24) {
        $email = 'secretary@bicol-u.edu.ph';
    }
    $contact = sprintf("0917%07d", 1000000 + (($i * 7919) % 9000000));
    $sex = ($i % 2 === 0) ? 'F' : 'M';
    
    $yl = (($i - 1) % 4) + 1;
    $userIdVal = ($i === 24) ? "9" : "NULL";

    $sql[] = "INSERT IGNORE INTO students (student_id, student_number, first_name, last_name, middle_name, bu_email, contact, sex, year_level, status, admission_date, birthdate, user_id, created_at) VALUES ({$i}, '{$sn}', '{$fn}', '{$ln}', '{$mn}', '{$email}', '{$contact}', '{$sex}', {$yl}, 'active', '2023-08-01', '2002-05-15', {$userIdVal}, NOW(6));";
    
    $studentsData[] = [
        'id' => $i,
        'sn' => $sn,
        'name' => "{$fn} {$ln}",
        'email' => $email,
        'yl' => $yl,
    ];
}
$sql[] = "";

// -----------------------------------------------------------------------------
// SECTION 5: BIOMETRIC INTEGRATION
// -----------------------------------------------------------------------------
$sql[] = "-- =============================================================================";
$sql[] = "-- 5. BIOMETRIC INTEGRATION";
$sql[] = "-- No biometric enrollment is seeded. A real integration must create these records.";
$sql[] = "-- =============================================================================";
$sql[] = "";

// -----------------------------------------------------------------------------
// SECTION 6: ENROLLMENTS & RETENTION RECORDS
// -----------------------------------------------------------------------------
$sql[] = "-- =============================================================================";
$sql[] = "-- 6. ENROLLMENTS & RETENTION STANDINGS";
$sql[] = "-- =============================================================================";
for ($i = 1; $i <= $TOTAL_STUDENTS; $i++) {
    $yl = (($i - 1) % 4) + 1;
    $blockChoice = ($i % 2 === 1) ? 'A' : 'B';
    
    if ($yl === 1) {
        $csId = ($blockChoice === 'A') ? 1 : 2;
    } elseif ($yl === 2) {
        $csId = ($blockChoice === 'A') ? 3 : 4;
    } elseif ($yl === 3) {
        $csId = ($blockChoice === 'A') ? 5 : 6;
    } else {
        $csId = ($blockChoice === 'A') ? 7 : 8;
    }

    $percentage = seed_percentage_for_student($i);
    $gwa = seed_gwa_from_percentage($percentage);
    $retState = $gwa <= 2.5 ? 'active' : ($gwa <= 3.0 ? 'warning' : 'critical');
    $hrs = 60 + (($i * 7) % 61);
    $remJson = "NULL";

    if ($i === 25) {
        $remJson = "'{\"pendingExams\":1,\"completedRemedials\":0,\"subjectCode\":\"CLIN401\",\"dueDate\":\"2026-08-15\"}'";
    }
    
    $compJson = "'{\"quizzes\":" . number_format($percentage, 1) . ",\"exams\":" . number_format($percentage, 1) . ",\"practicum\":" . number_format($percentage, 1) . ",\"attendance\":" . number_format($percentage, 1) . "}'";
    
    $sql[] = "INSERT IGNORE INTO enrollments (enrollment_id, student_id, cs_id, status, date_enrolled, final_percentage, final_gwa, grade_components_json, retention_state, remedial_state_json, clinic_hours_completed, created_at) VALUES ({$i}, {$i}, {$csId}, 'Active', '2024-08-15', {$percentage}, {$gwa}, {$compJson}, '{$retState}', {$remJson}, {$hrs}, NOW(6));";
}
$sql[] = "";

// -----------------------------------------------------------------------------
// SECTION 7: ASSESSMENTS & ASSESSMENT SCORES
// -----------------------------------------------------------------------------
$sql[] = "-- =============================================================================";
$sql[] = "-- 7. ASSESSMENTS & STUDENT SCORES";
$sql[] = "-- =============================================================================";
$assessmentId = 1;
$scoreId = 1;

for ($cs = 1; $cs <= 8; $cs++) {
    $assList = [
        ['Quiz 1: Tooth Anatomy & Morphology', 'Quiz', 'Midterm', 50.00, 10.00, '2024-09-10'],
        ['Practicum 1: Cavity Preparation Waxing', 'Laboratory', 'Midterm', 100.00, 20.00, '2024-09-25'],
        ['Midterm Theoretical Examination', 'Midterm Exam', 'Midterm', 100.00, 25.00, '2024-10-15'],
        ['Practicum 2: Crown Impressioning', 'Laboratory', 'Final', 100.00, 20.00, '2024-11-20'],
        ['Final Comprehensive Examination', 'Final Exam', 'Final', 100.00, 25.00, '2024-12-15'],
    ];
    
    foreach ($assList as $a) {
        $sql[] = "INSERT IGNORE INTO assessments (assessment_id, cs_id, title, type, grading_period, max_score, weight, due_date, status, created_at) VALUES ({$assessmentId}, {$cs}, '{$a[0]}', '{$a[1]}', '{$a[2]}', {$a[3]}, {$a[4]}, '{$a[5]}', 'Closed', NOW(6));";
        
        for ($st = 1; $st <= $TOTAL_STUDENTS; $st++) {
            $yl = (($st - 1) % 4) + 1;
            $blockChoice = ($st % 2 === 1) ? 'A' : 'B';
            $stCsId = ($yl === 1) ? ($blockChoice === 'A' ? 1 : 2) :
                     (($yl === 2) ? ($blockChoice === 'A' ? 3 : 4) :
                     (($yl === 3) ? ($blockChoice === 'A' ? 5 : 6) : ($blockChoice === 'A' ? 7 : 8)));

            if ($stCsId === $cs) {
                $scoreVal = round($a[3] * seed_percentage_for_student($st) / 100, 2);
                $remarks = $scoreVal >= ($a[3] * 0.75) ? 'Satisfactory' : 'Needs Remediation';
                
                $sql[] = "INSERT IGNORE INTO assessment_scores (score_id, assessment_id, student_id, score, submitted_at, remarks) VALUES ({$scoreId}, {$assessmentId}, {$st}, {$scoreVal}, '{$a[5]} 14:00:00.000000', '{$remarks}');";
                $scoreId++;
            }
        }
        
        $assessmentId++;
    }
}
$sql[] = "";

// -----------------------------------------------------------------------------
// SECTION 8: ATTENDANCE RECORDS
// -----------------------------------------------------------------------------
$sql[] = "-- =============================================================================";
$sql[] = "-- 8. ATTENDANCE MONITORING RECORDS";
$sql[] = "-- =============================================================================";
$attId = 1;
$dates = ['2024-09-02', '2024-09-09', '2024-09-16', '2024-09-23', '2024-09-30', '2024-10-07', '2024-10-14', '2024-10-21'];
foreach ($dates as $dIdx => $d) {
    for ($st = 1; $st <= $TOTAL_STUDENTS; $st++) {
        $enrId = $st;
        $yl = (($st - 1) % 4) + 1;
        $secUser = ($st === 24) ? "9" : "NULL";
        
        $status = 'present';
        $vMethod = 'manual_faculty';
        $overrideReason = "NULL";
        $overrideUser = "NULL";
        $overrideAt = "NULL";
        
        if ($st % 11 === 0) {
            $status = 'absent';
            $vMethod = 'manual_secretary';
        } elseif ($st % 7 === 0) {
            $status = 'late';
            $vMethod = 'manual_faculty';
        } elseif ($st % 13 === 0) {
            $status = 'excused';
            $vMethod = 'manual_secretary';
            $overrideReason = "'Medical Certificate submitted & verified by Dean'";
            $overrideUser = "2"; // Dr. Santos
            $overrideAt = "'{$d} 10:30:00.000000'";
        }
        
        $sql[] = "INSERT IGNORE INTO attendance_records (record_id, enrollment_id, session_date, session_code, session_start, session_end, status, verification_method, device_id, secretary_user_id, override_reason, override_by_user_id, override_at, time_recorded, created_at) VALUES ({$attId}, {$enrId}, '{$d}', 'SESSION-{$yl}-{$dIdx}', '08:00:00', '11:00:00', '{$status}', '{$vMethod}', NULL, {$secUser}, {$overrideReason}, {$overrideUser}, {$overrideAt}, '{$d} 08:05:00.000000', NOW(6));";
        $attId++;
    }
}
$sql[] = "";

// Runtime-only histories intentionally remain empty in the development seed.
$sql[] = "-- No fabricated email_outbox or audit_events rows are generated.";
$sql[] = "";

$sql[] = "SET FOREIGN_KEY_CHECKS = 1;";
$sql[] = "-- End of Clean DentiSys Development Seed Data Script";

$content = implode("\n", $sql);

file_put_contents(__DIR__ . '/../../database/seed.sql', $content);

echo "Successfully re-generated clean database/seed.sql with {$TOTAL_STUDENTS} students (" . strlen($content) . " bytes)\n";
