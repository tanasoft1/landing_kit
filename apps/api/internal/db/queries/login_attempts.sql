-- name: GetLoginAttempt :one
SELECT * FROM login_attempts WHERE email = @email AND ip = @ip;

-- name: RecordLoginFailure :one
-- One statement, so two concurrent failures cannot both read 2 and write 3. The caller feeds the
-- returned count to the backoff curve. A failure older than decay_before resets the count to one.
INSERT INTO login_attempts (email, ip, failed_count)
VALUES (@email, @ip, 1)
ON CONFLICT (email, ip) DO UPDATE
    SET failed_count = CASE
            WHEN login_attempts.last_failure_at < @decay_before THEN 1
            ELSE login_attempts.failed_count + 1
        END,
        last_failure_at = now()
RETURNING *;

-- name: ExtendLoginLock :exec
-- Only ever extends, so a concurrent request with a lower count cannot shorten a longer lock.
UPDATE login_attempts
SET locked_until = GREATEST(COALESCE(locked_until, @locked_until), @locked_until)
WHERE email = @email AND ip = @ip;

-- name: ClearLoginAttempts :exec
-- Clears only this pair, so the admin's sign-in does not reset an attacker's backoff.
DELETE FROM login_attempts WHERE email = @email AND ip = @ip;

-- name: PruneLoginAttempts :exec
-- Prunes by age, so rows that never reached a lock are removed too. A row still inside its lock
-- window is kept.
DELETE FROM login_attempts
WHERE last_failure_at < @stale_before
  AND (locked_until IS NULL OR locked_until < now());
