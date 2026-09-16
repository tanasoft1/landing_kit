// Package authhandler serves the admin login, refresh and logout endpoints. Named authhandler,
// not auth, so that a caller importing both this package and internal/service/auth never needs
// an import alias to tell them apart -- same convention as internal/http/handlers/lead's
// leadhandler.
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

// Login validates the request body and, on success, returns a fresh access/refresh token pair.
// Never logs req.Password: only the outcome and, on failure other than bad credentials, the
// underlying error.
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
			// The same error code loginLimiter's 429 uses, so the panel needs one case, not two.
			// The caller is only being told about failures they generated themselves.
			return c.Status(fiber.StatusTooManyRequests).JSON(models.ErrorResponse{
				Error: "rate limited", Message: "Хэт олон удаа оролдлоо. Дараа дахин оролдоно уу.",
			})
		}
		// Unknown email and wrong password reach here as the SAME error (see
		// auth.errInvalidCredentials), so this branch cannot leak account existence even if it
		// wanted to: it has no way left to tell the two cases apart.
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

// Refresh reads the refresh cookie, rotates it, and returns a fresh access token. Never logs the
// cookie's value.
//
// The token presented is dead either way: it was spent, or it was already spent and presenting it
// again killed every token issued from the same login.
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
			// Clear it. The token is dead, and leaving it in the browser means every future
			// request carries a credential that can only ever produce this same 401.
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

// Logout revokes the presented token's family and clears the cookie.
//
// Always 200, even with no cookie or a garbage one. A logout endpoint that distinguished "that
// was a valid session" from "that was nothing" would answer a question the caller has not
// authenticated to ask, and there is no action a client could take differently on the answer.
func (h *Handler) Logout(c *fiber.Ctx) error {
	if token := c.Cookies(RefreshCookieName); token != "" {
		h.svc.Logout(c.Context(), token, c.IP(), c.Get("User-Agent"))
	}
	clearRefreshCookie(c, h.cookieSecure)
	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true})
}
