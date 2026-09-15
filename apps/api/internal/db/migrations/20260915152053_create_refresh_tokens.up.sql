-- One row per issued refresh token. The jti is stored in the clear on purpose: this is a
-- revocation ledger, not a credential store. A jti proves nothing on its own, because presenting
-- it still requires the signed JWT that carries it, so hashing would buy lookup cost and no
-- security.
--
-- family_id ties every token descended from one login together. Rotation revokes the old row and
-- inserts a new one with the same family_id, so replaying a spent token can revoke the whole
-- chain rather than just the copy that was replayed.
CREATE TABLE refresh_tokens (
    jti        uuid PRIMARY KEY,
    admin_id   uuid        NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    family_id  uuid        NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);

CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_admin_expiry_idx ON refresh_tokens (admin_id, expires_at);
