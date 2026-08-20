// Package handlers holds one handler per domain, so routes wire against a single struct rather
// than a growing constructor parameter list.
package handlers

import (
	authhandler "landing-api/internal/http/handlers/auth"
	leadhandler "landing-api/internal/http/handlers/lead"
	"landing-api/internal/service"
)

// Handlers is every domain's HTTP handler.
type Handlers struct {
	Lead *leadhandler.Handler
	Auth *authhandler.Handler
}

// New builds every handler from the service layer.
func New(services *service.Services) *Handlers {
	return &Handlers{
		Lead: leadhandler.New(services.Lead),
		Auth: authhandler.New(services.Auth),
	}
}
