-- Two columns, both about the family rather than the single token the row describes.
--
-- family_expires_at is the absolute deadline for every token descended from one login. Without it
-- the refresh window is an idle timeout, not a session lifetime: every rotation recomputed the
-- expiry from scratch, so a holder who refreshed once a week kept the family alive forever, and a
-- thief who rotated quietly kept access forever with nothing to detect them. Login writes this
-- value once from JWT_SESSION_MAX_DAYS, rotation copies it forward unchanged, and every successor
-- clamps its own expires_at to min(now + JWT_REFRESH_EXPIRE_DAYS, family_expires_at).
--
-- Existing rows are backfilled from expires_at, which is the only deadline those families ever
-- had. That retires them on their current idle expiry rather than granting them a fresh 30 days,
-- which is the conservative direction for a column added to close an unbounded-lifetime hole.
ALTER TABLE refresh_tokens ADD COLUMN family_expires_at timestamptz;
UPDATE refresh_tokens SET family_expires_at = expires_at WHERE family_expires_at IS NULL;
ALTER TABLE refresh_tokens ALTER COLUMN family_expires_at SET NOT NULL;

-- replaced_by names the successor a rotation issued for this row. It is what lets Refresh tell a
-- lost response apart from a replay: a revoked row whose successor is still live, revoked moments
-- ago, is the shape of a rotation whose response never reached the browser, not the shape of a
-- stolen token. See the grace window in internal/service/auth.Refresh.
--
-- Deliberately not a foreign key to refresh_tokens(jti). DeleteExpiredRefreshTokens prunes by
-- expiry, and a self-referencing constraint would turn a housekeeping delete into a constraint
-- decision for a pointer that is only ever read inside a 30-second window, while both rows are
-- certainly alive. A dangling uuid here costs one lookup that finds nothing, which the grace-window
-- branch already handles as "not a lost response".
ALTER TABLE refresh_tokens ADD COLUMN replaced_by uuid;
