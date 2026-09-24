package notify_test

import (
	"context"
	"errors"
	"testing"

	"landing-api/internal/service/notify"
)

type fake struct {
	got  notify.LeadMessage
	err  error
	sent int
}

func (f *fake) Lead(_ context.Context, l notify.LeadMessage) error {
	f.sent++
	f.got = l
	return f.err
}

func TestLoggerNeverFails(t *testing.T) {
	t.Parallel()
	if err := notify.NewLogger().Lead(context.Background(), notify.LeadMessage{Name: "Bat"}); err != nil {
		t.Fatalf("logger notifier returned %v, want nil", err)
	}
}

func TestFakeSatisfiesNotifier(t *testing.T) {
	t.Parallel()
	var n notify.Notifier = &fake{err: errors.New("boom")}
	if err := n.Lead(context.Background(), notify.LeadMessage{Email: "a@b.mn"}); err == nil {
		t.Fatal("want the fake's error, got nil")
	}
}

func TestBuildSubject(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		siteName string
		leadName string
		want     string
	}{
		{
			name:     "site name set",
			siteName: "Landing Kit",
			leadName: "Bat",
			want:     "[Landing Kit] New lead from Bat",
		},
		{
			name:     "site name empty",
			siteName: "",
			leadName: "Bat",
			want:     "New lead from Bat",
		},
		{
			name:     "CRLF in lead name is stripped, not passed through",
			siteName: "",
			leadName: "Bat\r\nBcc: evil@example.com",
			want:     "New lead from BatBcc: evil@example.com",
		},
		{
			name:     "brackets in site name are passed through, not escaped",
			siteName: "[Admin]",
			leadName: "Bat",
			want:     "[[Admin]] New lead from Bat",
		},
		{
			name:     "surrounding whitespace is not trimmed",
			siteName: "",
			leadName: "  Bat  ",
			want:     "New lead from   Bat  ",
		},
		{
			name:     "empty visitor",
			siteName: "Landing Kit",
			leadName: "",
			want:     "[Landing Kit] New lead from ",
		},
		{
			name:     "empty visitor and empty site",
			siteName: "",
			leadName: "",
			want:     "New lead from ",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := notify.BuildSubject(tt.siteName, tt.leadName); got != tt.want {
				t.Errorf("BuildSubject(%q, %q) = %q, want %q", tt.siteName, tt.leadName, got, tt.want)
			}
		})
	}
}
