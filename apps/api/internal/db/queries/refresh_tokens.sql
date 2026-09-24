-- name: CreateRefreshToken :exec
-- family_expires_at is set at login and copied forward by every rotation. The caller clamps
-- expires_at to it.
INSERT INTO refresh_tokens (jti, admin_id, family_id, expires_at, family_expires_at)
VALUES ($1, $2, $3, $4, $5);

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens WHERE jti = $1;

-- name: RevokeRefreshToken :execrows
-- The caller must read the row count. Zero means another request spent this token first. A
-- SELECT beforehand cannot tell, because both requests can pass it before either writes.
UPDATE refresh_tokens
SET revoked_at = now(), replaced_by = @replaced_by
WHERE jti = @jti AND revoked_at IS NULL;

-- name: LockTokenFamily :exec
-- Serializes every writer on one token family until the transaction ends. Row locks are not
-- enough: a family revoke cannot see a successor row inserted after its scan began.
SELECT pg_advisory_xact_lock(hashtextextended((@family_id::uuid)::text, 0));

-- name: RevokeRefreshTokenFamily :exec
-- Must run under LockTokenFamily in the same transaction.
UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL;

-- name: DeleteExpiredRefreshTokens :exec
-- Runs on each login. expires_at is clamped to family_expires_at, so it covers both deadlines.
DELETE FROM refresh_tokens WHERE admin_id = $1 AND expires_at < now();
