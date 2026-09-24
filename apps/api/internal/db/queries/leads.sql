-- name: CreateLead :one
INSERT INTO leads (id, name, email, message, locale, source_page, ip, user_agent)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListLeads :many
-- The id tiebreaker keeps paging stable when two rows share a created_at.
SELECT * FROM leads
ORDER BY created_at DESC, id DESC
LIMIT $1 OFFSET $2;

-- name: CountLeads :one
SELECT count(*) FROM leads;
