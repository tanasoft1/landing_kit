// Package handlers holds one handler per domain, so routes wire against a single struct rather
// than a growing constructor parameter list.
package handlers

import (
	"landing-api/conf"
	authhandler "landing-api/internal/http/handlers/auth"
	leadhandler "landing-api/internal/http/handlers/lead"
	"landing-api/internal/service"
)

// Handlers is every domain's HTTP handler.
type Handlers struct {
	Lead *leadhandler.Handler
	Auth *authhandler.Handler
}

// New builds every handler from the service layer. cfg is taken for one reason: the auth handler
// has to know whether to mark its refresh cookie Secure, and that follows APP_ENV.
func New(services *service.Services, cfg *conf.Config) *Handlers {
	return &Handlers{
		Lead: leadhandler.New(services.Lead),
		Auth: authhandler.New(services.Auth, !cfg.IsDevelopment()),
	}
}
