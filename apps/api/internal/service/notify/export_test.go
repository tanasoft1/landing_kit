package notify

// BuildSubject exposes the unexported buildSubject to notify_test's table-driven test. Test-only:
// the production API stays unexported because Notifier is the only thing a caller needs.
var BuildSubject = buildSubject
