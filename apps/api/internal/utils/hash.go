package utils

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

// HashPassword hashes password with bcrypt at the library's default cost. Named and exported,
// unlike psyfint_v2_back which hashes ad hoc wherever it seeds an account: task 5's seed-admin
// subcommand needs this directly, and a shared function is what keeps that hash and the one
// CheckPasswordHash below verify from drifting to different costs.
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
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
