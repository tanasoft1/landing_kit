package models

// CreateLeadRequest is the contact form's wire shape. It matches
// apps/web/src/integrations/submit-schema.ts field for field, including the two anti-spam fields,
// because the client can be bypassed and this is the only check that cannot be.
type CreateLeadRequest struct {
	Name    string `json:"name" validate:"required,min=2,max=120"`
	Email   string `json:"email" validate:"required,email"`
	Message string `json:"message" validate:"required,min=10,max=4000"`
	Locale  string `json:"locale" validate:"omitempty,oneof=mn en"`
	// SourcePage is the path the form was submitted from, for attribution only. Never trusted
	// and never used to build a URL.
	SourcePage string `json:"source_page" validate:"omitempty,max=200"`
	// HoneypotURL must arrive empty. Named to match the frontend's `honeypot_url`, which is
	// deliberately not a real-sounding name: autofill fills recognised field names even with
	// autoComplete off, and a filled honeypot rejects a real person.
	//
	// validate:"-": deliberately not `max=0`. The handler's anti-spam block (see
	// internal/http/handlers/lead) is what rejects a filled honeypot, and it shares one generic
	// message with the timing check below. A `max=0` tag would let the general validator reject
	// this field first, on its own path, with its own message built from fieldNames["honeypot_url"]
	// (deliberately blank, see internal/utils/validator.go) -- and an empty-named "must be no more
	// than 0 elements" message is still a message distinguishable from the timing rejection's, which
	// tells a bot author exactly which check tripped. The one property this field exists to deny it.
	HoneypotURL string `json:"honeypot_url" validate:"-"`
	// ElapsedMs is milliseconds the form was on screen, checked against MinElapsedMS below.
	//
	// validate:"-" for the same reason as HoneypotURL above. A `required` tag only fires at
	// exactly 0, which is indistinguishable on the wire from an omitted field, and firing there
	// would name this field ("Хугацаа") through a different message than a submission that
	// merely arrived too fast (500ms, say) gets from the anti-spam block. Both must look
	// identical to the caller, so both are policed only by that block.
	ElapsedMs int `json:"elapsed_ms" validate:"-"`
}

// MinElapsedMS mirrors MIN_ELAPSED_MS in apps/web/src/integrations/submit-schema.ts. The two are
// not generated from one source in 2a; packages/contract does that in a later phase. Until then,
// changing one means changing the other, and the integration test in
// internal/http/handlers/lead/lead_test.go is what fails if they drift.
const MinElapsedMS = 2000
