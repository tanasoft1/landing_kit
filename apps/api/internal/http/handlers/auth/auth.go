// Package authhandler serves the admin login and refresh endpoints. Named authhandler, not auth,
// so that a caller importing both this package and internal/service/auth never needs an import
// alias to tell them apart -- same convention as internal/http/handlers/lead's leadhandler.
package authhandler

import (
	"log/slog"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/models"
	"landing-api/internal/service/auth"
	"landing-api/internal/utils"
)

// Handler serves POST /api/auth/login and POST /api/auth/refresh.
type Handler struct {
	svc *auth.Service
}

func New(svc *auth.Service) *Handler {
	return &Handler{svc: svc}
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

	resp, err := h.svc.Login(c.Context(), &req)
	if err != nil {
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

	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true, Data: resp})
}

// Refresh validates a refresh token and, on success, returns a fresh access/refresh token pair.
// Never logs req.RefreshToken.
func (h *Handler) Refresh(c *fiber.Ctx) error {
	var req models.RqRefreshToken
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

	resp, err := h.svc.Refresh(c.Context(), &req)
	if err != nil {
		if auth.IsInvalidToken(err) {
			return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse{
				Error: "invalid token", Message: "Токен хүчингүй байна",
			})
		}
		slog.Error("refresh failed", slog.Any("err", err))
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "internal error", Message: "Дотоод алдаа гарлаа. Дараа дахин оролдоно уу.",
		})
	}

	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true, Data: resp})
}
