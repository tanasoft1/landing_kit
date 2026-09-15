-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens (jti, admin_id, family_id, expires_at)
VALUES ($1, $2, $3, $4);

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens WHERE jti = $1;

-- name: RevokeRefreshToken :execrows
-- Returns rows affected, and the caller must read it. The WHERE clause carries revoked_at IS NULL,
-- so this single statement is both the check and the write: under READ COMMITTED the second of two
-- concurrent updates to the same row blocks on the row lock, then re-evaluates its predicate
-- against the committed version, finds revoked_at already set, and matches nothing. Zero rows
-- therefore means another request spent this token first, which is the same event as presenting an
-- already-revoked one. Reading the count is what makes spending a token atomic; a preceding SELECT
-- cannot, because two callers can both pass it before either writes.
UPDATE refresh_tokens SET revoked_at = now() WHERE jti = $1 AND revoked_at IS NULL;

-- name: RevokeRefreshTokenFamily :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL;

-- name: DeleteExpiredRefreshTokens :exec
-- Housekeeping, run on each login for the admin logging in. That keeps the table bounded with no
-- scheduled job: a row can only outlive its expiry until its owner next signs in.
DELETE FROM refresh_tokens WHERE admin_id = $1 AND expires_at < now();
