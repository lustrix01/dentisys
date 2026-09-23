# Local demo password-change contract

`POST /api/auth/password/change` changes the password for the account attached
to the authenticated access token.

## Request

The request uses `Content-Type: application/json` and an access token in the
`Authorization: Bearer <access-token>` header.

```json
{
  "current_password": "CurrentPass1!",
  "new_password": "NewPass2@",
  "confirm_password": "NewPass2@"
}
```

Admin, Faculty, Secretary, and Student accounts are supported. Google-linked
accounts still use their stored DentiSys password for this operation.

The current password must verify against the account row locked for the
transaction. The new password uses the existing server policy from
`validate_password_policy`; this endpoint does not add a new strength policy.
The confirmation must match exactly, and the new password must differ exactly
from the current password.

## Responses

Successful changes return `200`:

```json
{
  "status": "ok",
  "sign_in_again": true,
  "message": "Password changed successfully. Please sign in again."
}
```

The account `token_version` is incremented in the same transaction, so all
existing access and refresh credentials require sign-in again.

Invalid fields or an incorrect current password return `422` with the existing
validation envelope. Fields are `current_password`, `new_password`, and
`confirm_password`; examples include `Current password is incorrect.`,
`Passwords do not match.`, and the existing password-policy messages.

Missing, expired, stale, or invalid access credentials return `401`. An
unsupported account role returns `403`. The endpoint returns `429` after the
authenticated user exceeds 5 attempts per 15 minutes or the source IP exceeds
20 attempts per 15 minutes.

Audit records contain the account, session, request metadata, and a generic
successful password-change description. Password values and password hashes
are never included in responses, logs, or audit state.
