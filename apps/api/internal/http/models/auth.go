package models

import "github.com/google/uuid"

// RqLogin is POST /api/auth/login's wire shape.
type RqLogin struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// RqRefreshToken is POST /api/auth/refresh's wire shape.
type RqRefreshToken struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

// RsAuth is what both login and refresh return: a fresh token pair plus the admin's identity.
// AccessToken and RefreshToken are NOT interchangeable -- see
// internal/utils/secure.TokenService, which rejects each as the other.
type RsAuth struct {
	AccessToken  string         `json:"access_token"`
	RefreshToken string         `json:"refresh_token"`
	Admin        RsAdminProfile `json:"admin"`
}

// RsAdminProfile is the admin identity carried in RsAuth.
type RsAdminProfile struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	CreatedAt string    `json:"created_at"`
}
