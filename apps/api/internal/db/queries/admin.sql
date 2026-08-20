-- name: GetAdminByEmail :one
SELECT * FROM admin_users WHERE email = $1;

-- name: CreateAdmin :one
INSERT INTO admin_users (id, email, password_hash)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetAdminByID :one
SELECT * FROM admin_users WHERE id = $1;
