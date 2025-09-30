# Support Email Configuration Guide

## Overview

This guide covers setting up support@optioeducation.com for customer support communications.

**Status**: Needs Configuration
**Priority**: MEDIUM
**Estimated Time**: 1 hour
**Cost**: $0-$6/month

---

## Current State

**Email**: Not configured
**Contact Info**: Needs updating in Privacy Policy, Terms of Service, and website footer

---

## Email Setup Options

### Option 1: Email Forwarding (Free - Recommended for MVP)

**Best for**: Small teams, MVP launch, low support volume

**Steps**:
1. Access your domain registrar (where optioeducation.com is registered)
2. Find **Email Forwarding** or **Email Settings**
3. Create forwarding rule:
   - **From**: support@optioeducation.com
   - **To**: [your personal email]
4. Test by sending email to support@optioeducation.com
5. Verify it arrives in your inbox

**Pros**:
- Free
- Instant setup
- No new email client needed

**Cons**:
- Cannot send FROM support@optioeducation.com
- Replies come from personal email
- Limited to simple forwarding

**Cost**: $0/month

---

### Option 2: Google Workspace (Professional - Recommended for Growth)

**Best for**: Professional appearance, team collaboration, scalability

**Steps**:

1. **Sign up for Google Workspace**
   - Go to: https://workspace.google.com/
   - Click **Get Started**
   - Enter business details:
     - Business name: Optio Education
     - Number of employees: 1-9
     - Region: United States
   - Domain: optioeducation.com (you own it)

2. **Choose Plan**
   - **Business Starter**: $6/user/month
   - Includes: Gmail, Drive (30GB), Meet, Calendar
   - Cancel anytime

3. **Verify Domain Ownership**
   - Google provides TXT record
   - Add to your domain DNS settings
   - Wait 15 minutes for verification

4. **Create Support Email**
   - Go to Google Admin Console
   - **Users** → **Add User**
   - Email: support@optioeducation.com
   - Name: Optio Support
   - Password: [Generate secure password]

5. **Set Up Auto-Reply** (Optional)
   - Log in to support@optioeducation.com
   - Settings → General → Vacation responder
   - Message:
     ```
     Thank you for contacting Optio Support!

     We've received your message and will respond within 24-48 hours.

     For urgent issues, please include "URGENT" in your subject line.

     Best regards,
     The Optio Team
     ```

6. **Configure Forwarding** (Optional)
   - Settings → Forwarding and POP/IMAP
   - Add forwarding address: [your personal email]
   - Enable "Keep Optio's copy in Inbox"

**Pros**:
- Professional @optioeducation.com address
- Can send/receive as support@optioeducation.com
- Team collaboration features
- Integration with Google services
- Spam filtering
- 30GB storage

**Cons**:
- $6/month cost
- Requires domain verification

**Cost**: $6/month (Business Starter plan)

---

### Option 3: Gmail Alias (Free Alternative)

**Best for**: Very early stage, testing

**Steps**:
1. Use existing Gmail account
2. Add support@optioeducation.com as "Send mail as" alias
3. Requires domain DNS configuration (SPF, DKIM)
4. Can receive at Gmail, send as support@optioeducation.com

**Pros**:
- Free
- Uses existing Gmail

**Cons**:
- Complex DNS setup
- Less professional
- Deliverability issues possible

**Cost**: $0/month

---

## Recommended Approach

**Phase 1 (MVP Launch)**: Email Forwarding
- Quick setup
- Zero cost
- Test support volume

**Phase 2 (After First Users)**: Google Workspace
- Professional appearance
- Better for team growth
- Worth $6/month investment

---

## DNS Configuration

### For Email Forwarding (Option 1)

Typically handled by domain registrar automatically.

### For Google Workspace (Option 2)

Add these DNS records (Google provides specific values):

**MX Records** (Mail Exchange):
```
Priority  Hostname             Points to
1         optioeducation.com   ASPMX.L.GOOGLE.COM
5         optioeducation.com   ALT1.ASPMX.L.GOOGLE.COM
5         optioeducation.com   ALT2.ASPMX.L.GOOGLE.COM
10        optioeducation.com   ALT3.ASPMX.L.GOOGLE.COM
10        optioeducation.com   ALT4.ASPMX.L.GOOGLE.COM
```

**TXT Record** (Domain Verification):
```
optioeducation.com  TXT  google-site-verification=XXXXXXXXXXX
```

**TXT Record** (SPF - Spam Prevention):
```
optioeducation.com  TXT  v=spf1 include:_spf.google.com ~all
```

**Note**: Google Workspace setup wizard provides exact values.

---

## Update Contact Information

### Files to Update

**1. Privacy Policy** (`frontend/src/pages/PrivacyPolicy.jsx`):

Find the contact section and update:
```jsx
<h2 className="text-2xl font-bold mt-8 mb-4">Contact Us</h2>
<p>
  If you have any questions about this Privacy Policy, please contact us at{' '}
  <a href="mailto:support@optioeducation.com" className="text-blue-600 hover:underline">
    support@optioeducation.com
  </a>
</p>
```

**2. Terms of Service** (`frontend/src/pages/TermsOfService.jsx`):

Update contact section:
```jsx
<h2 className="text-2xl font-bold mt-8 mb-4">Contact Information</h2>
<p>
  For questions about these Terms, please contact us at{' '}
  <a href="mailto:support@optioeducation.com" className="text-blue-600 hover:underline">
    support@optioeducation.com
  </a>
</p>
```

**3. Footer** (if exists in layout component):

```jsx
<footer className="bg-gray-900 text-white py-8">
  <div className="container mx-auto text-center">
    <p className="mb-2">© 2025 Optio Education. All rights reserved.</p>
    <p>
      <a href="mailto:support@optioeducation.com" className="hover:text-gray-300">
        support@optioeducation.com
      </a>
    </p>
  </div>
</footer>
```

**4. Error Pages** (500, 404, etc.):

Add support contact:
```jsx
<p className="mt-4">
  Need help? Contact{' '}
  <a href="mailto:support@optioeducation.com" className="text-blue-600 hover:underline">
    support@optioeducation.com
  </a>
</p>
```

---

## Email Templates

### Auto-Reply Template

```
Subject: We received your message

Hello,

Thank you for contacting Optio Support!

We've received your message and will respond within 24-48 hours during business days.

In the meantime:
• Check our FAQ: https://www.optioeducation.com/faq
• Review our Help Docs: https://www.optioeducation.com/help
• Try our AI Tutor for immediate assistance

For urgent issues related to:
- Payment problems
- Account access issues
- Technical errors

Please include "URGENT" in your subject line.

Best regards,
The Optio Team

---
This is an automated response. Please do not reply to this email.
Your original message will be reviewed by our support team.
```

### Standard Response Template

```
Hello [Name],

Thank you for reaching out to Optio Support.

[Personalized response to their question]

Is there anything else I can help you with?

Best regards,
[Your Name]
Optio Support Team

support@optioeducation.com
https://www.optioeducation.com
```

### Bug Report Template

```
Hello [Name],

Thank you for reporting this issue. We take bug reports seriously.

I've logged this in our issue tracker with the following details:
- Issue: [Brief description]
- Priority: [Low/Medium/High]
- Expected timeline: [Timeframe]

We'll update you as soon as this is resolved.

In the meantime, here's a workaround if available:
[Workaround steps or "No workaround currently available"]

Best regards,
[Your Name]
Optio Support Team
```

### Feature Request Template

```
Hello [Name],

Thank you for your feature suggestion!

Your idea: [Summarize their request]

I've added this to our feature request list. While I can't guarantee it will be implemented, we review all suggestions regularly and prioritize based on user demand.

You can track the status of feature requests in our roadmap (if public) or check back with us periodically.

Thank you for helping us improve Optio!

Best regards,
[Your Name]
Optio Support Team
```

---

## Support Workflow

### 1. Triage (Within 2 hours)

- Read email
- Categorize:
  - **Bug**: Technical issue
  - **Question**: How-to or clarification
  - **Feature Request**: New feature suggestion
  - **Account Issue**: Login, payment, etc.
  - **Spam**: Delete

### 2. Prioritize

**P0 - Critical (Respond within 2 hours)**:
- Payment failures
- Account access issues
- Data loss
- Security concerns

**P1 - High (Respond within 24 hours)**:
- Feature not working
- Quest completion issues
- Subscription problems

**P2 - Medium (Respond within 48 hours)**:
- General questions
- Minor bugs
- Feature requests

**P3 - Low (Respond within 1 week)**:
- Documentation feedback
- Enhancement suggestions

### 3. Respond

- Use appropriate template
- Personalize response
- Be friendly and professional
- Include next steps if applicable

### 4. Track

Create simple tracking system:

**Option A: Spreadsheet**
| Date | From | Subject | Category | Priority | Status | Resolved Date |
|------|------|---------|----------|----------|--------|---------------|

**Option B: Labels in Gmail**
- `support/bug`
- `support/question`
- `support/feature-request`
- `support/resolved`

---

## Monitoring & Metrics

### Key Metrics to Track

**Response Time**:
- First response time (target: < 24 hours)
- Resolution time (target: < 72 hours)

**Volume**:
- Emails received per day/week
- By category (bug, question, feature)

**Quality**:
- Customer satisfaction (follow-up survey)
- Resolved vs. unresolved
- Escalations

**Common Issues**:
- Track frequently asked questions
- Update FAQ based on patterns
- Identify recurring bugs

---

## Integrations (Future)

As support volume grows, consider:

**Help Desk Software**:
- **Zendesk**: $19/month/agent
- **Freshdesk**: Free tier available
- **Help Scout**: $20/month/user
- **Intercom**: $74/month

**Features**:
- Ticket management
- Knowledge base
- Canned responses
- Analytics
- Team collaboration

---

## Implementation Checklist

### Phase 1: Basic Setup

- [ ] Choose email option (forwarding vs. Google Workspace)
- [ ] Configure email (forwarding rules or new account)
- [ ] Test email receiving (send test to support@optioeducation.com)
- [ ] Test email sending (reply from support address)
- [ ] Set up auto-reply (optional)

### Phase 2: Update Website

- [ ] Update Privacy Policy with support email
- [ ] Update Terms of Service with support email
- [ ] Add support email to footer (if applicable)
- [ ] Add support email to error pages
- [ ] Deploy changes to production

### Phase 3: Prepare for Support

- [ ] Create email templates (auto-reply, standard responses)
- [ ] Set up email labels/folders for organization
- [ ] Create support tracking spreadsheet
- [ ] Define response time goals
- [ ] Assign support responsibilities (if team)

### Phase 4: Launch

- [ ] Announce support email to existing users (if any)
- [ ] Monitor inbox daily
- [ ] Track response times
- [ ] Iterate on templates based on common questions

---

## Support Best Practices

### Dos

✅ Respond promptly (within 24 hours)
✅ Be friendly and empathetic
✅ Personalize responses (use their name)
✅ Provide clear next steps
✅ Follow up on unresolved issues
✅ Learn from common questions
✅ Thank users for feedback

### Don'ts

❌ Use overly technical jargon
❌ Make promises you can't keep
❌ Ignore negative feedback
❌ Copy-paste without personalization
❌ Argue with users
❌ Let emails sit for days
❌ Forget to update ticket status

---

## FAQ Creation from Support

As support emails come in, use them to build your FAQ:

**Process**:
1. Track questions in spreadsheet
2. Identify top 5-10 most common questions
3. Write clear answers
4. Create FAQ page (see Phase 8 document)
5. Link to FAQ in auto-reply
6. Update FAQ monthly

**Example Common Questions**:
- How do I reset my password?
- How do I upgrade my subscription?
- Can I cancel anytime?
- How do I delete my account?
- What are the different subscription tiers?
- How do I submit evidence for a quest?
- Can I get a refund?

---

## Cost Summary

| Option | Setup Time | Monthly Cost | Best For |
|--------|-----------|--------------|----------|
| Email Forwarding | 15 min | $0 | MVP launch |
| Google Workspace | 1 hour | $6 | Professional setup |
| Gmail Alias | 2 hours | $0 | Testing only |

**Recommendation**: Start with email forwarding ($0), upgrade to Google Workspace ($6/month) after first users.

---

## Next Steps

1. **Today**: Choose email option
2. **Today**: Configure email forwarding or Google Workspace
3. **Today**: Test sending/receiving
4. **This Week**: Update website with support email
5. **Before Launch**: Create email templates
6. **At Launch**: Monitor inbox daily

---

**Priority**: MEDIUM (helpful but not blocking launch)
**Estimated Time**: 1 hour total
**Recommendation**: Set up email forwarding before launch, upgrade to Google Workspace after traction

---

**Last Updated**: 2025-09-29
**Status**: Documentation Complete - Ready for Implementation