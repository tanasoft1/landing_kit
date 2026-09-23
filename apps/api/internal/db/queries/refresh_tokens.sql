-- name: CreateRefreshToken :exec
-- A rotation's insert runs in the same transaction as the revoke that preceded it, under the
-- family lock (see LockTokenFamily). The two halves of spending a token and issuing its successor
-- commit together or not at all, and no family revoke can interleave between them.
--
-- family_expires_at is written once by the login that started the family and copied forward
-- unchanged by every rotation, which is what makes it an absolute deadline rather than another
-- idle timeout. The caller clamps expires_at to it, so a successor can never outlive its family.
INSERT INTO refresh_tokens (jti, admin_id, family_id, expires_at, family_expires_at)
VALUES ($1, $2, $3, $4, $5);

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens WHERE jti = $1;

-- name: RevokeRefreshToken :execrows
-- Returns rows affected, and the caller must read it. The WHERE clause carries revoked_at IS NULL,
-- so this single statement is both the check and the write: under READ COMMITTED the second of two
-- concurrent updates to the same row blocks on the row lock, then re-evaluates its predicate
-- against the committed version, finds revoked_at already set, and matches nothing. Zero rows
-- therefore means another request spent this token first, which is the same event as presenting an
-- already-revoked one. Reading the count is what settles which of the two spent the token; a
-- preceding SELECT cannot, because both callers can pass it before either writes.
--
-- replaced_by is written by the same statement that spends the row, so a spent row always names
-- its successor. Refresh reads it to tell a lost rotation response apart from a replay: see the
-- grace window there.
UPDATE refresh_tokens
SET revoked_at = now(), replaced_by = @replaced_by
WHERE jti = @jti AND revoked_at IS NULL;

-- name: LockTokenFamily :exec
-- Serializes every writer that touches one token family, for the length of the calling
-- transaction. Row locks cannot do this job: they order two writes to the same row, and the
-- orderings that matter here are a write against an INSERT of a row that does not exist yet.
-- An UPDATE's scan cannot see a row inserted after its own statement began, so a family revoke
-- racing a rotation can miss the successor and leave it live in a family that has just been
-- declared compromised. Every writer taking this lock first means the second one begins after
-- the first has committed, and sees what it wrote.
SELECT pg_advisory_xact_lock(hashtextextended((@family_id::uuid)::text, 0));

-- name: RevokeRefreshTokenFamily :exec
-- Must run under LockTokenFamily in the same transaction. Without the lock this UPDATE races a
-- rotation of a live token in the same family: it blocks on that token's row lock, re-evaluates,
-- skips the row the rotation just revoked, and never sees the successor, because that row was
-- inserted after this statement's scan began. The successor survives live in a family this call
-- has just declared dead. The lock makes the two writers run one after the other instead.
UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL;

-- name: DeleteExpiredRefreshTokens :exec
-- Housekeeping, run on each login for the admin logging in. That keeps the table bounded with no
-- scheduled job: a row can only outlive its expiry until its owner next signs in.
--
-- expires_at alone still covers the family deadline, because every row's expiry is clamped to its
-- family_expires_at at issue time: a row whose family has lapsed is already past its own expiry.
DELETE FROM refresh_tokens WHERE admin_id = $1 AND expires_at < now();
