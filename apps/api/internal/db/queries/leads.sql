-- name: CreateLead :one
INSERT INTO leads (id, name, email, message, locale, source_page, ip, user_agent)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListLeads :many
-- The id tiebreaker is not decoration. ORDER BY created_at alone is not a total order, and two
-- rows can share a created_at under concurrent inserts, at which point LIMIT/OFFSET paging can
-- show the same lead on two pages or skip one entirely. Postgres is free to return tied rows in
-- any order between queries.
SELECT * FROM leads
ORDER BY created_at DESC, id DESC
LIMIT $1 OFFSET $2;
