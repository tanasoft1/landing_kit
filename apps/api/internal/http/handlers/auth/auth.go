// Package authhandler serves the admin login, refresh and logout endpoints.
package authhandler

import (
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/models"
	"landing-api/internal/service/auth"
	"landing-api/internal/utils"
)

// Handler serves POST /api/auth/login, POST /api/auth/refresh and POST /api/auth/logout.
type Handler struct {
	svc          *auth.Service
	cookieSecure bool
}

func New(svc *auth.Service, cookieSecure bool) *Handler {
	return &Handler{svc: svc, cookieSecure: cookieSecure}
}

// Login validates the request body and, on success, returns a fresh token pair.
func (h *Handler) Login(c *fiber.Ctx) error {
	var req models.RqLogin
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "validation error", Message: "Хүсэлтийн бүтэц буруу байна",
		})
	}

	if msg := utils.ValidateStruct(req); msg != "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "validation error", Message: msg,
		})
	}

	result, err := h.svc.Login(c.Context(), &req, c.IP(), c.Get("User-Agent"))
	if err != nil {
		if auth.IsAccountLocked(err) {
			// Same body as loginLimiter's 429, so the panel handles one case.
			return c.Status(fiber.StatusTooManyRequests).JSON(models.ErrorResponse{
				Error: "rate limited", Message: "Хэт олон удаа оролдлоо. Дараа дахин оролдоно уу.",
			})
		}
		if auth.IsInvalidCredentials(err) {
			return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
				Error: "invalid credentials", Message: "Имэйл эсвэл нууц үг буруу байна",
			})
		}
		slog.Error("login failed", slog.Any("err", err))
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "internal error", Message: "Дотоод алдаа гарлаа. Дараа дахин оролдоно уу.",
		})
	}

	setRefreshCookie(c, result.RefreshToken, result.RefreshExpiresAt, h.cookieSecure)
	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true, Data: models.RsAuth{
		AccessToken: result.AccessToken,
		Admin:       result.Admin,
	}})
}

// Refresh reads the refresh cookie, rotates it, and returns a fresh access token.
func (h *Handler) Refresh(c *fiber.Ctx) error {
	token := c.Cookies(RefreshCookieName)
	if token == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
			Error: "invalid token", Message: "Токен хүчингүй байна",
		})
	}

	result, err := h.svc.Refresh(c.Context(), token, c.IP(), c.Get("User-Agent"))
	if err != nil {
		if auth.IsInvalidToken(err) {
			clearRefreshCookie(c, h.cookieSecure)
			return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
				Error: "invalid token", Message: "Токен хүчингүй байна",
			})
		}
		slog.Error("refresh failed", slog.Any("err", err))
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "internal error", Message: "Дотоод алдаа гарлаа. Дараа дахин оролдоно уу.",
		})
	}

	setRefreshCookie(c, result.RefreshToken, result.RefreshExpiresAt, h.cookieSecure)
	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true, Data: models.RsAuth{
		AccessToken: result.AccessToken,
		Admin:       result.Admin,
	}})
}

// Logout revokes the presented token's family and clears the cookie. Always 200, so it reveals nothing.
func (h *Handler) Logout(c *fiber.Ctx) error {
	if token := c.Cookies(RefreshCookieName); token != "" {
		h.svc.Logout(c.Context(), token, c.IP(), c.Get("User-Agent"))
	}
	clearRefreshCookie(c, h.cookieSecure)
	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true})
}
