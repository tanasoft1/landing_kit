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

// sesNotifier is the production Notifier.
type sesNotifier struct {
	client   *sesv2.Client
	from     string
	to       string
	siteName string
}

// NewSES builds a Notifier backed by Amazon SES. Without AWS_ACCESS_KEY_ID it uses the ambient
// AWS credentials, such as an EC2 or EKS role.
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
	// Check the resolved region, since it can come from env or a shared profile. Do not add
	// WithEC2IMDSRegion: off EC2 it makes startup wait out an IMDS timeout.
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

// buildSubject returns "[Site] New lead from Bat", or no prefix when siteName is empty.
// CR and LF are stripped from the name, because the SDK does not check for header injection.
func buildSubject(siteName, name string) string {
	name = strings.ReplaceAll(name, "\r", "")
	name = strings.ReplaceAll(name, "\n", "")
	if siteName == "" {
		return "New lead from " + name
	}
	return fmt.Sprintf("[%s] New lead from %s", siteName, name)
}

// Lead sends a plain-text email. Reply-To is the visitor. From stays SES_FROM, since the visitor's
// address would fail SPF/DKIM and land in spam.
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
