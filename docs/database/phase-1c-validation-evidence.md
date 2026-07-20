# Phase 1C Validation Evidence

## Environment

| Property | Value |
|----------|-------|
| Date | 2026-07-20 |
| MariaDB version | 10.4.32-MariaDB-1:10.4.32+maria~ubu2004 |
| PHP version | CLI available |
| Docker | Docker version 29.6.1 |
| OS | Windows (PowerShell 5.1) |

Credentials loaded from environment; values redacted.

## Staged Migration Test

**Command**: `php tests/database/staged_migration_test.php`

### Positive Scenario

All 80 migrations applied to disposable database:
- 001-048: Applied, 20 business tables confirmed
- 4 email-based user_account fixtures inserted
- 049-080: Applied, 46 business tables confirmed
- 4 user_account rows preserved, all login_email NOT NULL, all role_id NOT NULL
- 3 access_role, 66 permission, 117 role_permission, 8 component_type
- 11 triggers, uq_faculty_user_id enforced
- 3 components backfilled to component_type, 1 academic_term created

### Negative Scenarios

| # | Scenario | Failing Migration | Result |
|---|----------|-------------------|--------|
| NEG-050 | Unknown component alias | 050 | PASS (45000) |
| NEG-052 | Invalid semester | 052 | PASS (45000) |
| NEG-065A | Non-email username | 065 | PASS (45000) |
| NEG-065B | Duplicate normalized email | 065 | PASS (45000) |
| NEG-065C | Unknown role | 065 | PASS (45000) |
| NEG-066A | Duplicate faculty.user_id | 066 | PASS (45000) |
| NEG-066B | is_admin/role contradiction | 066 | PASS (45000) |

All seven negative scenarios pass. Each runs on an isolated disposable database.

## Schema Contract Test

**Command**: `php tests/database/schema_contract_test.php`

All counts verified: 46 business tables, 3 roles, 66 permissions, 117 bindings, 8 component types, 11 triggers, 8 BINARY(32) columns, 6 generated columns. 6 ALTER outcomes confirmed. 7 unique constraints confirmed.

### Eleven Trigger Behavior Tests

| # | Trigger | Result |
|---|---------|--------|
| T01 | audit_event UPDATE rejected | PASS |
| T02 | audit_event DELETE rejected | PASS |
| T03 | attendance_override UPDATE rejected | PASS |
| T04 | attendance_override DELETE rejected | PASS |
| T05 | completed remedial_attempt UPDATE rejected | PASS |
| T06 | remedial_attempt DELETE rejected | PASS |
| T07 | completed faculty_approval UPDATE rejected | PASS |
| T08 | faculty_approval DELETE rejected | PASS |
| T09 | completed email_delivery UPDATE rejected | PASS |
| T10 | email_delivery DELETE rejected | PASS |
| T11 | invitation accept with mismatched student rejected | PASS |

## Documentation Contract Test

**Command**: `php tests/documentation/doc_contract_test.php`

ALL PASSED. Module A heading, TOTP flow, RBAC matrix, closing rationale confirmed. Module C heading, endpoint table, ACL rules, OWASP labels, closing rationale confirmed. No raw secrets found in docs or migrations.

## Frontend Lint and Build

```
npm --prefix frontend run lint: 164 problems (152 errors, 12 warnings) — baseline unchanged
npm --prefix frontend run build: Built in 4.07s — PASS
```

## Existing Backend Tests

```
php tests/backend/config_test.php: PASS
php tests/backend/database_config_test.php: PASS
php tests/backend/response_test.php: PASS
```

## Historical Migration Integrity

Literal command:
```powershell
$historical = Get-ChildItem database/migrations -File |
  Where-Object {
    if ($_.Name -match '^(\d{3})_') {
      $number = [int]$Matches[1]
      return $number -ge 1 -and $number -le 48
    }
    return $false
  } |
  Sort-Object Name |
  ForEach-Object { $_.FullName }

Write-Output "Historical migration count: $($historical.Count)"
git diff --exit-code -- $historical
Write-Output "Historical migration diff exit code: $LASTEXITCODE"
```

Output:
```
Historical migration count: 48
Historical migration diff exit code: 0
```

Result: All 48 migrations 001-048 unchanged.

## Untracked Historical-Number Collision Check

Literal command:
```powershell
$untrackedHistorical = git ls-files --others --exclude-standard -- database/migrations |
  Where-Object {
    $name = [System.IO.Path]::GetFileName($_)
    if ($name -match '^(\d{3})_') {
      $number = [int]$Matches[1]
      return $number -ge 1 -and $number -le 48
    }
    return $false
  }

$untrackedHistorical
Write-Output "Untracked historical-number collision count: $($untrackedHistorical.Count)"
Write-Output "Collision-check exit code: $LASTEXITCODE"
```

Output:
```
Untracked historical-number collision count: 0
Collision-check exit code: 0
```

## Git Diff and Inventory

```
git diff --check: Exit code 0 (no patch errors)
git diff --name-status: M database/migrations/README.md, M docs/architecture.md, M docs/phase-0-roadmap.md, M docs/requirements-traceability.md
git diff --stat: 4 files changed, 20 insertions(+), 4 deletions(-)
git diff --cached --name-status: (no output, exit 0)
git diff --cached --stat: (no output, exit 0)
```

No changes under frontend/src/, backend/, scripts/.

## File Inventory

43 new untracked files: 32 migrations, 3 tests, 6 database docs, 2 IAS docs
4 modified tracked files (stale doc fixes)
0 deleted, 0 staged, 0 forbidden-path changes

## Limitations

- Backend cryptographic operations (TOTP, JWT, HMAC, AES, rate-limiting) deferred
- API endpoints proposed/unimplemented
- ACL deployment documentation-only
- Test execution requires Docker with MariaDB
