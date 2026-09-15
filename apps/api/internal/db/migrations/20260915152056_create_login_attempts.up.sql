-- Keyed by email as submitted, whether or not that email is registered. Writing rows only for
-- real accounts would make the presence of a lockout an account-existence oracle, which is the
-- exact leak dummyPasswordHash in internal/service/auth closes on the timing side.
CREATE TABLE login_attempts (
    email        text PRIMARY KEY,
    failed_count int         NOT NULL DEFAULT 0,
    locked_until timestamptz
);
