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

// HashPassword hashes password at bcryptCost. Named and exported, unlike psyfint_v2_back which
// hashes ad hoc wherever it seeds an account: seed-admin needs this directly, and a shared
// function is what keeps that hash and the one CheckPasswordHash verifies from drifting apart.
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

// CheckPasswordHash reports whether password matches hash. Mirrors
// psyfint_v2_back/internal/utils/hash.go.
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
