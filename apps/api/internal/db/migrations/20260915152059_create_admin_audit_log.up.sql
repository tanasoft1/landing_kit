-- admin_id is nullable because a failed login against an unregistered email has no admin to name.
--
-- The attempted email is deliberately NOT a column. A log of guessed addresses is worth more to
-- whoever steals this database than to whoever owns it, and the per-IP and per-account counters
-- already answer "is someone attacking us" without keeping the guesses.
CREATE TABLE admin_audit_log (
    id         uuid PRIMARY KEY,
    admin_id   uuid REFERENCES admin_users(id) ON DELETE SET NULL,
    event      text        NOT NULL,
    ip         text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
