-- Secretary invitations previously copied the raw invitation token into
-- security_tokens.metadata_json. Only the SHA-256 digest (secret_hash) is
-- needed to accept an invitation, so remove the stored raw token. The
-- invitation rows themselves (status, timestamps, names) are kept.
UPDATE security_tokens
   SET metadata_json = metadata_json - 'token'
 WHERE purpose = 'secretary_invitation'
   AND metadata_json ? 'token';
