# Email Template System - How to Edit Email Copy

## Quick Start: Editing Email Content

**To change any email content, edit this file:**
```
backend/templates/email/email_copy.yaml
```

All email text, subjects, buttons, and signatures are centralized in this single YAML file. You can edit the copy without touching any HTML or code files.

## Structure of email_copy.yaml

### Signatures Section
Define reusable signatures for emails:

```yaml
signatures:
  team:
    name: "The Optio Team"
    email: "support@optioeducation.com"

  tanner:
    name: "Dr. Tanner Bowman"
    title: "Founder, Optio"
    email: "tanner@optioeducation.com"
```

### Emails Section
Each email type has its own configuration:

```yaml
emails:
  welcome:
    subject: "Welcome to Optio!"
    greeting: "Welcome to Optio, {user_name}!"
    paragraphs:
      - "First paragraph of text"
      - "Second paragraph of text"
    bullet_points:
      - "First bullet point"
      - "Second bullet point"
    cta:
      text: "Button text"
      url: "https://www.optioeducation.com/page"
    signature: "team"  # or "tanner" or "support"
```

## Variable Placeholders

Use `{variable_name}` in your copy to insert dynamic content:

- `{user_name}` - User's display name
- `{parent_name}` - Parent's name
- `{quest_title}` - Quest title
- `{xp_earned}` - XP amount
- `{confirmation_link}` - Email confirmation URL
- `{tier_display_name}` - Subscription tier name
- And more...

## Available Email Types

1. **welcome** - New user welcome email
2. **email_confirmation** - Email verification
3. **quest_completion** - Quest completed celebration
4. **promo_welcome** - Promo landing page signup
5. **consultation_confirmation** - Consultation booking confirmation
6. **parental_consent** - COPPA parental consent request
7. **subscription_request_user** - Subscription upgrade confirmation
8. **subscription_request_admin** - Admin notification for subscription requests

## Common Editing Tasks

### Change Email Subject
```yaml
emails:
  welcome:
    subject: "Your new subject line here!"
```

### Update Button Text
```yaml
emails:
  welcome:
    cta:
      text: "New button text"
      url: "https://www.optioeducation.com/new-page"
```

### Add/Remove Bullet Points
```yaml
emails:
  welcome:
    bullet_points:
      - "First item"
      - "Second item"
      - "Add as many as you need"
```

### Change Signature
```yaml
emails:
  welcome:
    signature: "tanner"  # Changes from team to personal signature
```

### Update Highlight Box
```yaml
emails:
  welcome:
    highlight_box:
      title: "New Title"
      content: "New content that will appear in a highlighted box"
```

## Example: Complete Email Configuration

```yaml
emails:
  welcome:
    subject: "Welcome to Optio!"
    title: "Welcome to Optio!"
    greeting: "Welcome to Optio, {user_name}!"
    paragraphs:
      - "We're excited to have you join our learning community."
      - "Your account has been successfully created."
    bullet_points:
      - "Explore quests"
      - "Track progress"
      - "Build your diploma"
    cta:
      text: "Go to Dashboard"
      url: "https://www.optioeducation.com/dashboard"
    highlight_box:
      title: "The Process Is The Goal"
      content: "At Optio, we believe learning is about the journey..."
    closing_paragraph: "If you have questions, we're here to help."
    signature: "support"
    footer_extra: "If you didn't create this account, ignore this email."
```

## Testing Changes

After editing `email_copy.yaml`:

1. Save the file
2. Deploy to develop branch
3. The changes will take effect immediately (no code changes needed)
4. Test by triggering the email (e.g., register a new account for welcome email)

## Important Notes

- **Always use proper YAML syntax** (indentation matters!)
- **Keep variable placeholders** like `{user_name}` intact
- **Test on develop branch** before deploying to production
- **All emails automatically BCC** support@optioeducation.com for monitoring

## Automatic BCC Monitoring

Every email sent through the platform automatically BCCs `support@optioeducation.com` so you can monitor all outgoing emails in your inbox.

## File Structure

```
backend/templates/email/
├── README.md                    ← You are here!
├── email_copy.yaml             ← Edit this file for all email content
├── base.html                   ← Base HTML template (styling)
├── signatures.html             ← Signature macros
├── welcome.html/.txt           ← Individual email templates
├── email_confirmation.html/.txt
├── quest_completion.html/.txt
├── promo_welcome.html/.txt
├── consultation_confirmation.html/.txt
├── parental_consent.html/.txt
├── subscription_request_user.html/.txt
└── subscription_request_admin.html/.txt
```

## Need Help?

If you need to make changes beyond simple copy edits (like changing the layout or adding new email types), you'll need to work with the template HTML files or contact the development team.
