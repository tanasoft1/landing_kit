package utils

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

// bcryptCost is the cost every new hash is written at. bcrypt.DefaultCost is 10; 12 is the
// current OWASP floor. The cost is encoded inside the hash itself, so raising this does not
// invalidate anything already stored -- CheckPasswordHash reads each hash's own cost. Accounts
// move up through NeedsRehash below, on their next successful login.
const bcryptCost = 12

// HashPassword hashes password at bcryptCost. Named and exported rather than hashed ad hoc at
// each call site: seed-admin needs this directly, and one shared function is what keeps the hash
// it writes and the one CheckPasswordHash verifies from drifting apart.
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

// CheckPasswordHash reports whether password matches hash.
func CheckPasswordHash(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// NeedsRehash reports whether hash was written at a cost below the current one.
//
// An unreadable hash returns false, not true. A hash bcrypt cannot parse is not a stale hash, it
// is a corrupt row, and rewriting it on the strength of a successful password check would replace
// a broken record with a working one that nobody knows changed.
func NeedsRehash(hash string) bool {
	cost, err := bcrypt.Cost([]byte(hash))
	if err != nil {
		return false
	}
	return cost < bcryptCost
}

// HashCostIsCurrent reports whether hash is a bcrypt hash written at exactly the current cost.
//
// This is not the negation of NeedsRehash, and the two answer different questions. NeedsRehash
// asks whether a stored password should be rewritten, so it forgives everything that is not a
// hash below the current cost. This asks whether a hash takes the same time to compare as one
// this package would write today, so it forgives nothing: a cost above the current one fails,
// and so does anything bcrypt cannot parse.
//
// Callers that need a comparison to take a predictable amount of time want this one. An
// unparseable value is the worst case for them, not a harmless one, because
// CompareHashAndPassword rejects it on the parse rather than doing any work at all.
func HashCostIsCurrent(hash string) bool {
	cost, err := bcrypt.Cost([]byte(hash))
	return err == nil && cost == bcryptCost
}
