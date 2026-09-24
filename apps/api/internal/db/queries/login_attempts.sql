-- name: GetLoginAttempt :one
SELECT * FROM login_attempts WHERE email = @email AND ip = @ip;

-- name: RecordLoginFailure :one
-- One statement so two concurrent failures cannot both read 2 and both write 3. The returned row
-- carries the post-increment value, which is the number the caller feeds to the backoff curve, and
-- the lock itself is written by ExtendLoginLock afterwards. The curve stays in Go because it is
-- policy, not storage.
--
-- Keyed on the pair, not on the email. A lock that spanned every source address was a denial of
-- service against any admin whose address is known: it refused the real admin's correct password
-- along with the guesses, and one stranger sending a failure each time the lock lapsed held it on
-- indefinitely. Per source, a stranger locks out only themselves.
--
-- The count decays on top of that. A failure older than decay_before resets it to one instead of
-- adding to it, so a source that served a full-length lock starts again from the bottom of the
-- curve rather than staying pinned at its cap. That is what lets an admin who fumbled their
-- password nine times from their own machine recover without waiting for the prune.
--
-- decay_before is a timestamp computed in Go rather than an interval literal here, for the same
-- reason the curve is in Go: the window is policy. Storage only compares.
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
-- Only ever extends. Concurrent failures compute different windows from different counts, and the
-- longest one is the one that should stand: taking the last writer instead would let a request
-- that incremented to 5 shorten a lock a request that incremented to 20 had already set.
UPDATE login_attempts
SET locked_until = GREATEST(COALESCE(locked_until, @locked_until), @locked_until)
WHERE email = @email AND ip = @ip;

-- name: ClearLoginAttempts :exec
-- Clears the pair that just succeeded, not every row for the email. Clearing them all would let
-- one successful sign-in wipe the backoff another source had accumulated, which hands an attacker
-- a free reset every time the real admin signs in.
DELETE FROM login_attempts WHERE email = @email AND ip = @ip;

-- name: PruneLoginAttempts :exec
-- Prunes on staleness, not on the lock. The previous version required locked_until IS NOT NULL,
-- and a row only gets that at five failures, so an attacker who stopped at four per address left
-- one permanent row per address tried -- exactly the "spray across a million addresses" the prune
-- was written to bound, and exactly the rows it did not touch.
--
-- The locked_until half stays as a guard, not as the selector: a row still inside its lock window
-- is evidence of something current no matter how old its last failure looks.
--
-- Rows now multiply by distinct source addresses per email rather than being one per email, so
-- this deletes more than it was written to. It still bounds the table, because the bound was never
-- the number of rows: every row needs a failed login to create it and a fresh failure every day to
-- survive, and the per-client rate limit caps how many of those one source can send. A sprayer
-- across many addresses and many sources writes more rows and still has to keep every one of them
-- warm.
DELETE FROM login_attempts
WHERE last_failure_at < @stale_before
  AND (locked_until IS NULL OR locked_until < now());
