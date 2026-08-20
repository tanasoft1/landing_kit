package migrations

import "embed"

// Embedded so a built binary carries its own schema. A migration file that ships separately is a
// deploy step someone forgets, and the failure is a running server against an old schema.
//
//go:embed *.sql
var FS embed.FS
