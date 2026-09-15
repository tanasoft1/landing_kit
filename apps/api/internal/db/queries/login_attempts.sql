-- name: GetLoginAttempt :one
SELECT * FROM login_attempts WHERE email = $1;

-- name: RecordLoginFailure :one
-- One statement so two concurrent failures cannot both read 2 and both write 3. The caller
-- supplies locked_until because the backoff curve is policy and belongs in Go, not in SQL.
INSERT INTO login_attempts (email, failed_count, locked_until)
VALUES ($1, 1, $2)
ON CONFLICT (email) DO UPDATE
    SET failed_count = login_attempts.failed_count + 1,
        locked_until = $2
RETURNING *;

-- name: ClearLoginAttempts :exec
DELETE FROM login_attempts WHERE email = $1;
