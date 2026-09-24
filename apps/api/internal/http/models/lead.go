package models

import (
	"time"

	"github.com/google/uuid"
)

// CreateLeadRequest is the contact form's wire shape. It matches the frontend's submit-schema.ts.
type CreateLeadRequest struct {
	Name    string `json:"name" validate:"required,min=2,max=120"`
	Email   string `json:"email" validate:"required,email"`
	Message string `json:"message" validate:"required,min=10,max=4000"`
	Locale  string `json:"locale" validate:"omitempty,oneof=mn en"`
	// SourcePage is for attribution only. Never use it to build a URL.
	SourcePage string `json:"source_page" validate:"omitempty,max=200"`
	// HoneypotURL must arrive empty. Its name must not sound real, or autofill fills it.
	// validate:"-" on purpose: a validator tag would give a different message than the handler's
	// spam check, and tell a bot which check tripped.
	HoneypotURL string `json:"honeypot_url" validate:"-"`
	// ElapsedMs is how long the form was on screen. validate:"-" for the same reason as HoneypotURL.
	ElapsedMs int `json:"elapsed_ms" validate:"-"`
}

// MinElapsedMS must equal MIN_ELAPSED_MS in the frontend's submit-schema.ts. Change both together.
const MinElapsedMS = 2000

// RsLead is one row of GET /api/admin/leads. It is separate from sqlc.Lead to keep the wire shape stable.
type RsLead struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	Email      string    `json:"email"`
	Message    string    `json:"message"`
	Locale     string    `json:"locale"`
	SourcePage string    `json:"source_page,omitempty"`
	IP         string    `json:"ip,omitempty"`
	UserAgent  string    `json:"user_agent,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// RsLeadPage is what GET /api/admin/leads returns: one page plus the size of the whole set.
type RsLeadPage struct {
	Items []RsLead `json:"items"`
	Total int64    `json:"total"`
}
