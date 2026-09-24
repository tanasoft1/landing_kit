DROP INDEX login_attempts_last_failure_idx;
ALTER TABLE login_attempts DROP COLUMN last_failure_at;
