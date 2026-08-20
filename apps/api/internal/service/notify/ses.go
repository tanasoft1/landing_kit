package notify

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"landing-api/conf"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	"github.com/aws/aws-sdk-go-v2/service/sesv2/types"
)

// sesNotifier is the production Notifier. Client construction and the send call mirror
// habido-back's internal/utils/mail/ses.go: that SDK surface is easy to get subtly wrong from
// memory, and there is a working in-house version.
type sesNotifier struct {
	client   *sesv2.Client
	from     string
	to       string
	siteName string
}

// NewSES builds a Notifier backed by Amazon SES.
//
// habido-back's ses.go always builds static credentials with
// aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(...)) and never falls back to
// anything else. That line is mirrored here verbatim for the case where cfg.AWSKeyID is set. The
// deviation: when it is empty, this loads the ambient AWS config chain instead (instance profile,
// EKS pod identity, shared config, ...), so a service running on EC2 or EKS with an attached role
// needs no long-lived keys in the environment at all. habido-back has no such path because it
// always requires explicit keys; this seam adds one because a landing site deployed into an AWS
// account that already grants role-based access should not need a second credential just to send
// mail.
func NewSES(ctx context.Context, cfg conf.NotifyConfig) (Notifier, error) {
	optFns := []func(*awsconfig.LoadOptions) error{awsconfig.WithRegion(cfg.AWSRegion)}
	if cfg.AWSKeyID != "" {
		optFns = append(optFns, awsconfig.WithCredentialsProvider(
			aws.NewCredentialsCache(
				credentials.NewStaticCredentialsProvider(cfg.AWSKeyID, cfg.AWSSecret, ""),
			),
		))
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, optFns...)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}
	// Checked against the resolved config, not the raw env var: conf.Load cannot require
	// AWS_REGION at the config boundary the way it requires NOTIFY_TO and SES_FROM, because a
	// region can legitimately come from several places this code lets aws-sdk-go-v2/config
	// resolve on its own: the AWS_REGION or AWS_DEFAULT_REGION environment variable, or a
	// "region" line in a shared config profile.
	//
	// EC2 instance metadata (IMDS) is deliberately NOT one of those places. The SDK only queries
	// IMDS for a region when LoadOptions.UseEC2IMDSRegion is set via
	// awsconfig.WithEC2IMDSRegion(), which is never called here, so getEC2IMDSRegion short-
	// circuits before any IMDS client is built. Calling WithEC2IMDSRegion() would make a bare EC2
	// instance profile with nothing else configured resolve a region, but at the cost of every
	// host that is NOT on EC2 (a laptop, a non-EC2 container) waiting out an IMDS connect timeout
	// on every startup with no region set, turning this fast, clear failure into a hang.
	//
	// Do not assume a deployment target injects AWS_REGION for you: Lambda always does; ECS only
	// on the Fargate launch type, not reliably on EC2; EKS only when the pod identity webhook's
	// --aws-default-region flag is explicitly enabled, which it is not by default. Treat
	// AWS_REGION as a variable this deployment must set, not one it can count on inheriting.
	if awsCfg.Region == "" {
		return nil, errors.New("AWS_REGION not set and no region resolved from the ambient AWS config")
	}

	return &sesNotifier{
		client:   sesv2.NewFromConfig(awsCfg),
		from:     cfg.From,
		to:       cfg.To,
		siteName: cfg.SiteName,
	}, nil
}

// buildSubject names the site, when configured, and the visitor: "[Landing Kit] New lead from
// Bat". siteName empty degrades to "New lead from Bat" rather than a broken or placeholder-filled
// subject: an owner running only one site through this template has nothing to disambiguate, so
// there is nothing worth guarding at config validation time either.
//
// Deliberately not l.SourcePage: "New lead from /contact" names a route, not a site. SourcePage
// stays in the body, where which page the visitor was on is genuinely useful.
//
// CR and LF are stripped from the visitor's name before it reaches the subject line. The SDK's
// validators only check that Content.Data is non-nil, never its content, so whether SES's
// server-side RFC 5322 composition would strip an embedded CRLF is an assumption this code does
// not rely on, and one that cannot be tested without a live send. Email needs no equivalent
// sanitiser here: task 5's handler validates it with the `email` struct tag before the lead
// service ever calls Notifier.Lead.
func buildSubject(siteName, name string) string {
	name = strings.ReplaceAll(name, "\r", "")
	name = strings.ReplaceAll(name, "\n", "")
	if siteName == "" {
		return "New lead from " + name
	}
	return fmt.Sprintf("[%s] New lead from %s", siteName, name)
}

// Lead sends a plain-text email, mirroring habido-back's SendEmail shape (Destination, Content,
// Simple, Message, Subject, Body) with two changes required by this seam rather than habido's:
//
//   - Body.Text instead of Body.Html: the brief calls for plain text, and a lead notification has
//     no formatting worth the extra surface.
//   - ReplyToAddresses is set to the visitor's email so the owner can reply directly from their
//     mail client. From stays cfg.From (SES_FROM) and is never the visitor's address, which would
//     fail SPF/DKIM alignment for the sending domain and land in spam.
//
// See buildSubject for how the subject names the site.
func (s *sesNotifier) Lead(ctx context.Context, l LeadMessage) error {
	subject := buildSubject(s.siteName, l.Name)
	body := fmt.Sprintf(
		"Name: %s\nEmail: %s\nLocale: %s\nSource page: %s\n\nMessage:\n%s\n",
		l.Name, l.Email, l.Locale, l.SourcePage, l.Message,
	)

	_, err := s.client.SendEmail(ctx, &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(s.from),
		Destination: &types.Destination{
			ToAddresses: []string{s.to},
		},
		ReplyToAddresses: []string{l.Email},
		Content: &types.EmailContent{
			Simple: &types.Message{
				Subject: &types.Content{Data: aws.String(subject)},
				Body: &types.Body{
					Text: &types.Content{Data: aws.String(body)},
				},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("send lead notification: %w", err)
	}
	return nil
}
