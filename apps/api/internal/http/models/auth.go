package models

import "github.com/google/uuid"

// RqLogin is POST /api/auth/login's wire shape.
type RqLogin struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// RsAuth is what login and refresh return. The refresh token travels only as an HttpOnly cookie.
type RsAuth struct {
	AccessToken string         `json:"access_token"`
	Admin       RsAdminProfile `json:"admin"`
}

// RsAdminProfile is the admin identity carried in RsAuth.
type RsAdminProfile struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	CreatedAt string    `json:"created_at"`
}
