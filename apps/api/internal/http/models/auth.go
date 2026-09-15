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
//
// RefreshToken replaces whichever one the caller sent, and that one is dead from here on. A client
// that keeps the old one and retries with it revokes its own session, because a refresh token
// presented twice is indistinguishable from a stolen one.
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
