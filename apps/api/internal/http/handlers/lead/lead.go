// Package leadhandler serves the public contact form endpoint. Named leadhandler, not lead, so
// that a caller importing both this package and internal/service/lead never needs an import
// alias to tell them apart.
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

// genericRejectionMessage is what a bad submission is told, regardless of WHY it was rejected by
// the checks below. Sharing one string, rather than each check formatting its own text, is what
// keeps them from drifting apart if one is edited later.
const genericRejectionMessage = "Мессеж илгээхэд алдаа гарлаа"

// Create validates and stores one contact-form submission.
//
// Order: bind, then utils.ValidateStruct for field-shape errors (each names the offending
// field), then the two anti-spam checks -- the honeypot and the timing floor -- which share
// genericRejectionMessage and never say which of the two tripped. See models.CreateLeadRequest
// for why those two fields carry validate:"-" instead of a struct tag of their own: a struct tag
// would let ValidateStruct reject them first, on its own path, with a message distinguishable
// from this block's.
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

	// Both checks return the SAME generic 400 a validation failure returns, and neither says
	// which check tripped. A distinct message tells a bot author exactly what to change.
	if req.HoneypotURL != "" || req.ElapsedMs < models.MinElapsedMS {
		slog.Info("lead rejected", slog.String("reason", "spam-guard"), slog.String("ip", c.IP()))
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "validation error", Message: genericRejectionMessage,
		})
	}

	// site.defaultLocale is "mn"; an empty Locale here means the client sent none rather than
	// an invalid one (ValidateStruct's omitempty,oneof already rejected anything else).
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
		// The lead's own message is never logged (see notify.LeadMessage); nothing here logs it
		// either, only the error returned from the query layer.
		slog.Error("create lead failed", slog.Any("err", err))
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "internal error", Message: "Дотоод алдаа гарлаа. Дараа дахин оролдоно уу.",
		})
	}

	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true})
}

// DefaultListLimit and MaxListLimit bound GET /api/admin/leads. An uncapped limit would let one
// request pull every lead the site has ever received; MaxListLimit is the ceiling List clamps to
// regardless of what the query string asks for.
const (
	DefaultListLimit = 50
	MaxListLimit     = 200
)

// List returns leads newest-first, behind AuthMiddleware. limit and offset come from the query
// string: limit defaults to DefaultListLimit when absent or non-positive, and is clamped to
// MaxListLimit no matter how large a value is requested.
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
	// Clamped before the int32 conversion below, not after: sqlc generated an int32 offset
	// param (see ListLeadsParams), and converting an int larger than that range wraps rather
	// than erroring, which would otherwise turn a huge offset into an unpredictable small or
	// negative one instead of the largest offset this query can express.
	if offset > math.MaxInt32 {
		offset = math.MaxInt32
	}

	leads, err := h.svc.List(c.Context(), int32(limit), int32(offset))
	if err != nil {
		slog.Error("list leads failed", slog.Any("err", err))
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "internal error", Message: "Дотоод алдаа гарлаа. Дараа дахин оролдоно уу.",
		})
	}

	return c.Status(fiber.StatusOK).JSON(models.SuccessResponse{Success: true, Data: leads})
}
