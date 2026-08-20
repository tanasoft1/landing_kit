package handlers

import (
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/models"
	"landing-api/internal/utils/secure"
)

// ContextKeyAdminID and ContextKeyEmail are where AuthMiddleware stores the token's claims, read
// back by any handler behind it that needs the caller's identity.
const (
	ContextKeyAdminID = "admin_id"
	ContextKeyEmail   = "email"
)

// AuthMiddleware requires "Authorization: Bearer <access token>" and rejects anything else.
// Mirrors ~/work/psyfint_v2_back/internal/http/handlers/middleware.go: the same three failure
// shapes (missing header, malformed header, invalid token) and the same Mongolian messages, so
// an operator who has seen one service's 401 recognizes the other's.
func AuthMiddleware(tokenService *secure.TokenService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			slog.Warn("authentication failed - missing authorization header", slog.String("path", c.Path()))
			return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
				Error:   "unauthorized",
				Message: "Нэвтрэх эрхийн мэдээлэл дутуу байна",
			})
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			slog.Warn("authentication failed - invalid authorization format", slog.String("path", c.Path()))
			return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
				Error:   "unauthorized",
				Message: "Нэвтрэх эрхийн формат буруу байна",
			})
		}

		// Never logged: the bearer token itself, only the error parsing or validating it
		// produces.
		claims, err := tokenService.ValidateAccessToken(parts[1])
		if err != nil {
			slog.Warn("authentication failed - invalid token", slog.Any("err", err), slog.String("path", c.Path()))
			return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
				Error:   "invalid token",
				Message: "Токен хүчингүй байна",
			})
		}

		c.Locals(ContextKeyAdminID, claims.AdminID)
		c.Locals(ContextKeyEmail, claims.Email)

		return c.Next()
	}
}
