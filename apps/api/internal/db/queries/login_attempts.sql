-- name: GetLoginAttempt :one
SELECT * FROM login_attempts WHERE email = $1;

-- name: RecordLoginFailure :one
-- One statement so two concurrent failures cannot both read 2 and both write 3. The returned row
-- carries the post-increment value, which is the number the caller feeds to the backoff curve, and
-- the lock itself is written by ExtendLoginLock afterwards. The curve stays in Go because it is
-- policy, not storage.
--
-- The count decays. A failure older than decay_before resets it to one instead of adding to it,
-- which is what stops the backoff from becoming a permanent lockout: without it the curve pinned
-- at its cap after nine failures and stayed there, so one request every fifteen minutes held a
-- known admin email shut forever. An attacker now has to sustain more than one failure per decay
-- window to keep the lock on, and the per-IP limiter bounds how fast a single host can do that.
--
-- decay_before is a timestamp computed in Go rather than an interval literal here, for the same
-- reason the curve is in Go: the window is policy. Storage only compares.
INSERT INTO login_attempts (email, failed_count)
VALUES (@email, 1)
ON CONFLICT (email) DO UPDATE
    SET failed_count = CASE
            WHEN login_attempts.last_failure_at < @decay_before THEN 1
            ELSE login_attempts.failed_count + 1
        END,
        last_failure_at = now()
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
-- Prunes on staleness, not on the lock. The previous version required locked_until IS NOT NULL,
-- and a row only gets that at five failures, so an attacker who stopped at four per address left
-- one permanent row per address tried -- exactly the "spray across a million addresses" the prune
-- was written to bound, and exactly the rows it did not touch.
--
-- The locked_until half stays as a guard, not as the selector: a row still inside its lock window
-- is evidence of something current no matter how old its last failure looks.
DELETE FROM login_attempts
WHERE last_failure_at < @stale_before
  AND (locked_until IS NULL OR locked_until < now());
