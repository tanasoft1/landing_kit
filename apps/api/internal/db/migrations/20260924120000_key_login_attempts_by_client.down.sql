-- Narrowing the key back to email is lossy by nature, not by choice of implementation: the wide
-- key holds rows the narrow one cannot, so one row per email has to survive and the rest are
-- discarded. The survivor is the row with the highest failed_count, which keeps the longest backoff
-- any single source had earned; ip breaks a tie so exactly one row wins. Every other source's count
-- and lock are dropped, and reverting therefore hands some callers a clean slate they had not
-- earned. A tie can also discard a lock that was still running, which the surviving count
-- re-establishes on the next failure rather than leaving the address open.
DELETE FROM login_attempts a
USING login_attempts b
WHERE a.email = b.email
  AND (b.failed_count, b.ip) > (a.failed_count, a.ip);

ALTER TABLE login_attempts DROP CONSTRAINT login_attempts_pkey;
ALTER TABLE login_attempts DROP COLUMN ip;
ALTER TABLE login_attempts ADD PRIMARY KEY (email);
