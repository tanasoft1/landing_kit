package utils

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

// bcryptCost is the OWASP floor. Each hash stores its own cost, so raising this breaks nothing;
// old hashes upgrade on the next login through NeedsRehash.
const bcryptCost = 12

// HashPassword hashes password at bcryptCost.
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

// NeedsRehash reports whether hash was written at a cost below the current one. An unreadable
// hash returns false: it is a corrupt row, and should not be silently replaced.
func NeedsRehash(hash string) bool {
	cost, err := bcrypt.Cost([]byte(hash))
	if err != nil {
		return false
	}
	return cost < bcryptCost
}

// HashCostIsCurrent reports whether hash is a bcrypt hash at exactly the current cost, so it
// compares in the same time as a real one. It is not the negation of NeedsRehash.
func HashCostIsCurrent(hash string) bool {
	cost, err := bcrypt.Cost([]byte(hash))
	return err == nil && cost == bcryptCost
}
