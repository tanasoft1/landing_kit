package handlers

import (
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/models"
	"landing-api/internal/utils/secure"
)

// ContextKeyAdminID and ContextKeyEmail are where AuthMiddleware stores the token's claims.
const (
	ContextKeyAdminID = "admin_id"
	ContextKeyEmail   = "email"
)

// AuthMiddleware requires "Authorization: Bearer <access token>" and rejects anything else.
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
