-- name: GetLoginAttempt :one
SELECT * FROM login_attempts WHERE email = $1;

-- name: RecordLoginFailure :one
-- One statement so two concurrent failures cannot both read 2 and both write 3. It touches only
-- the count: the returned row carries the post-increment value, which is the number the caller
-- feeds to the backoff curve, and the lock itself is written by ExtendLoginLock afterwards. The
-- curve stays in Go because it is policy, not storage.
INSERT INTO login_attempts (email, failed_count)
VALUES ($1, 1)
ON CONFLICT (email) DO UPDATE
    SET failed_count = login_attempts.failed_count + 1
RETURNING *;

-- name: ExtendLoginLock :exec
-- Only ever extends. Concurrent failures compute different windows from different counts, and the
-- longest one is the one that should stand: taking the last writer instead would let a request
-- that incremented to 5 shorten a lock a request that incremented to 20 had already set.
UPDATE login_attempts
SET locked_until = GREATEST(COALESCE(locked_until, @locked_until), @locked_until)
WHERE email = @email;

-- name: ClearLoginAttempts :exec
DELETE FROM login_attempts WHERE email = $1;

-- name: PruneLoginAttempts :exec
-- Rows whose lock lapsed more than a day ago cannot affect any future decision: the backoff curve
-- reads failed_count, and a count that old is not evidence of anything current.
DELETE FROM login_attempts WHERE locked_until IS NOT NULL AND locked_until < now() - interval '1 day';
