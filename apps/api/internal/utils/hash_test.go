package utils_test

import (
	"testing"

	"landing-api/internal/utils"
)

func TestHashPasswordRoundTrips(t *testing.T) {
	t.Parallel()

	hash, err := utils.HashPassword("correct-horse-battery")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !utils.CheckPasswordHash("correct-horse-battery", hash) {
		t.Error("CheckPasswordHash = false, want true for the password that was hashed")
	}
}

func TestCheckPasswordHashRejectsWrongPassword(t *testing.T) {
	t.Parallel()

	hash, err := utils.HashPassword("correct-horse-battery")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if utils.CheckPasswordHash("wrong-password", hash) {
		t.Error("CheckPasswordHash = true, want false for a mismatched password")
	}
}
