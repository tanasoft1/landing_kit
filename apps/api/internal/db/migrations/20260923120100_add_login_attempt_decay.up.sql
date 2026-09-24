-- failed_count only ever grew. Nothing decayed it, so once an email had failed nine times the
-- backoff curve was pinned at its 15-minute cap and every later failure re-locked for the full
-- window. One request every fifteen minutes held a known admin address shut permanently, which is
-- the exact property the comment on maxLockDuration in internal/service/auth rules out.
--
-- last_failure_at is what RecordLoginFailure reads to decide between incrementing and resetting to
-- one, so a lock now costs an attacker a sustained rate rather than one request every quarter hour.
-- It is also what PruneLoginAttempts deletes on: the old prune required locked_until to be set,
-- which only happens at five failures, so an attacker who stopped at four left one permanent row
-- per address tried, written by unauthenticated requests.
--
-- DEFAULT now() backfills existing rows to "failed just now", which is the safe direction: those
-- rows keep their counts until the decay window passes rather than all decaying at once on deploy.
ALTER TABLE login_attempts ADD COLUMN last_failure_at timestamptz NOT NULL DEFAULT now();

-- The prune scans on this column and nothing else selects by it, so one index serves the only
-- query that would otherwise sequential-scan a table an unauthenticated caller can grow.
CREATE INDEX login_attempts_last_failure_idx ON login_attempts (last_failure_at);
