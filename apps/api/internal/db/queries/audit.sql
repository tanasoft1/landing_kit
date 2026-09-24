-- name: CreateAuditLog :exec
INSERT INTO admin_audit_log (id, admin_id, event, ip, user_agent)
VALUES ($1, $2, $3, $4, $5);
