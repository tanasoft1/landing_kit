// Package leadhandler serves the contact form and lead list endpoints.
package leadhandler

import (
	"log/slog"
	"math"

	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/models"
	"landing-api/internal/service/lead"
	"landing-api/internal/utils"
)

// Handler serves the contact form endpoint.
type Handler struct {
	svc *lead.Service
}

func New(svc *lead.Service) *Handler {
	return &Handler{svc: svc}
}

const genericRejectionMessage = "Мессеж илгээхэд алдаа гарлаа"

// Create validates and stores one contact-form submission.
func (h *Handler) Create(c *fiber.Ctx) error {
	var req models.CreateLeadRequest
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

	// One message for both checks. A distinct one tells a bot author what to change.
	if req.HoneypotURL != "" || req.ElapsedMs < models.MinElapsedMS {
		slog.Info("lead rejected", slog.String("reason", "spam-guard"), slog.String("ip", c.IP()))
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "validation error", Message: genericRejectionMessage,
		})
	}

	locale := req.Locale
	if locale == "" {
		locale = "mn"
	}

	err := h.svc.Create(c.Context(), lead.Input{
		Name:       req.Name,
		Email:      req.Email,
		Message:    req.Message,
		Locale:     locale,
		SourcePage: req.SourcePage,
		IP:         c.IP(),
		UserAgent:  c.Get("User-Agent"),
	})
	if err != nil {
		slog.Error("create lead failed", slog.Any("err", err))
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "internal error", Message: "Дотоод алдаа гарлаа. Дараа дахин оролдоно уу.",
		})
	}

	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true})
}

// DefaultListLimit and MaxListLimit bound the page size of GET /api/admin/leads.
const (
	DefaultListLimit = 50
	MaxListLimit     = 200
)

// List returns one page of leads, newest first, plus the total count.
func (h *Handler) List(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", DefaultListLimit)
	if limit <= 0 {
		limit = DefaultListLimit
	}
	if limit > MaxListLimit {
		limit = MaxListLimit
	}

	offset := c.QueryInt("offset", 0)
	if offset < 0 {
		offset = 0
	}
	// Clamp before the int32 conversion, which would wrap instead of failing.
	if offset > math.MaxInt32 {
		offset = math.MaxInt32
	}

	page, err := h.svc.List(c.Context(), int32(limit), int32(offset))
	if err != nil {
		slog.Error("list leads failed", slog.Any("err", err))
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "internal error", Message: "Дотоод алдаа гарлаа. Дараа дахин оролдоно уу.",
		})
	}

	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true, Data: page})
}
