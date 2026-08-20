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

// Pins the interface: a Notifier must be satisfiable by a test double, which is what lets
// internal/service/lead be tested without sending mail.
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
			// This is the proof for the CRLF stripping in buildSubject: it is the case that
			// fails if someone removes it. Header injection through Data is not exploitable
			// today (Data lands in a typed, JSON-encoded SDK field, not a raw header line), but
			// whether SES's own RFC 5322 composition strips an embedded CRLF is untested and
			// this case removes the dependency on that assumption.
			name:     "CRLF in lead name is stripped, not passed through",
			siteName: "",
			leadName: "Bat\r\nBcc: evil@example.com",
			want:     "New lead from BatBcc: evil@example.com",
		},
		{
			// NOTIFY_SITE_NAME is unvalidated by design (see conf.NotifyConfig.SiteName): an
			// operator pasting brackets is a real input, not a hypothetical one, and the result
			// should be exactly two extra brackets, not a mangled or escaped subject.
			name:     "brackets in site name are passed through, not escaped",
			siteName: "[Admin]",
			leadName: "Bat",
			want:     "[[Admin]] New lead from Bat",
		},
		{
			// Pins that buildSubject does not trim surrounding whitespace, so a later change
			// cannot start, or stop, trimming without a test noticing either way.
			name:     "surrounding whitespace is not trimmed",
			siteName: "",
			leadName: "  Bat  ",
			want:     "New lead from   Bat  ",
		},
		{
			// task 5's handler does not exist yet, so an empty Name is a reachable path today,
			// not just a hypothetical one. buildSubject degrades to a subject with a trailing
			// space rather than doing anything more elaborate; it takes no position on whether
			// that is validated away upstream.
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
