-- The lockout was keyed on the email alone, and that is a remote denial of service against any
-- admin whose address is known. An account-wide lock cannot both refuse an attacker's guesses and
-- admit the real admin, because deciding which of the two is knocking means evaluating the
-- password, and evaluating it is the thing the lock exists to refuse. So a stranger who sent one
-- failed login each time the lock lapsed held the address shut for as long as they cared to, and
-- the real admin arriving with the right password was refused alongside them.
--
-- Decaying the count does not close that. For the decay to break the hold it has to be shorter
-- than the longest lock the curve can set, and even then the attacker only has to re-climb the
-- curve each cycle: a handful of requests an hour still denies the address most of the time. The
-- keying is the fix, not the window.
--
-- (email, ip) makes the lock belong to the source that earned it. A stranger hammering the admin's
-- address locks out their own source and nobody else's, and the admin signing in from anywhere
-- else never meets a lock at all. What this deliberately gives up is a throttle that spans source
-- addresses: an attacker spread across many of them pays the backoff once per address instead of
-- once in total. That property and the denial of service are the same property, so it cannot be
-- kept. Guessing is still charged per source -- five free attempts, then the same doubling backoff
-- -- on top of the per-client rate limit in front of the endpoint.
--
-- ip is text and not inet because the key needs a value for "no resolvable client address" and
-- inet has none. The service never writes that value: it skips the lockout entirely when it has no
-- address, for the reason written beside the code. Existing rows backfill to '', which is one row
-- per email, so the widened key holds with no dedupe step; nothing reads those rows afterwards and
-- the staleness prune removes them a day after their last failure.
ALTER TABLE login_attempts ADD COLUMN ip text NOT NULL DEFAULT '';

-- The primary key's own index answers every point lookup here, by the pair and by email alone on
-- its leading column, so the widening costs no second index. login_attempts_last_failure_idx stays:
-- it serves the prune, which selects on last_failure_at and on nothing else.
ALTER TABLE login_attempts DROP CONSTRAINT login_attempts_pkey;
ALTER TABLE login_attempts ADD PRIMARY KEY (email, ip);
