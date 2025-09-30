# Optio Subprocessors and Third-Party Services
**Version:** 1.0
**Effective Date:** January 30, 2025
**Last Updated:** January 30, 2025

## Overview

This document lists all third-party service providers (subprocessors) that Optio uses to process user data. This list is maintained for GDPR compliance and transparency with our users.

## Purpose

Subprocessors are third-party companies that process personal data on behalf of Optio. We carefully select our subprocessors based on their security practices, compliance certifications, and ability to protect user data.

## Updates

We will update this list when we add or change subprocessors. Users will be notified of material changes through:
- Email notification to registered users
- Update notification on the platform
- Update to this document with version history

## Active Subprocessors

### 1. Supabase Inc.
**Purpose**: Database hosting and user authentication
**Location**: United States (cloud infrastructure may span multiple regions)
**Data Processed**:
- All user profile information
- Educational records and achievements
- Quest completions and evidence
- User authentication credentials
- All application data except payment information

**Services Provided**:
- PostgreSQL database hosting
- User authentication (Supabase Auth)
- File storage (evidence documents, images)
- Real-time database subscriptions

**Security Measures**:
- SOC 2 Type II compliant
- Encryption at rest and in transit
- Row Level Security (RLS)
- Regular security audits
- GDPR compliant

**Data Processing Agreement**: Available through Supabase dashboard
**Website**: https://supabase.com
**Privacy Policy**: https://supabase.com/privacy

---

### 2. Stripe, Inc.
**Purpose**: Payment processing and subscription management
**Location**: United States
**Data Processed**:
- Payment card information (tokenized, not stored by Optio)
- Billing address
- Email address
- Name
- Subscription status and history

**Services Provided**:
- Credit card processing
- Subscription billing
- Payment method storage
- Invoice generation
- Refund processing

**Security Measures**:
- PCI DSS Level 1 compliant (highest level)
- SOC 1 and SOC 2 certified
- Encryption of cardholder data
- Regular security assessments
- GDPR compliant

**Data Processing Agreement**: Available in Stripe Terms of Service
**Website**: https://stripe.com
**Privacy Policy**: https://stripe.com/privacy

---

### 3. Render Services, Inc.
**Purpose**: Cloud infrastructure hosting and deployment
**Location**: United States (multiple regions available)
**Data Processed**:
- All application data that flows through the platform
- Server logs
- Application performance metrics

**Services Provided**:
- Web application hosting
- Backend API hosting
- Load balancing
- SSL/TLS certificates
- CDN services
- Database backup storage

**Security Measures**:
- SOC 2 Type II compliant
- ISO 27001 certified
- DDoS protection
- Encryption in transit (TLS 1.3)
- Regular security updates
- GDPR compliant

**Data Processing Agreement**: Available through Render dashboard
**Website**: https://render.com
**Privacy Policy**: https://render.com/privacy

---

### 4. OpenAI, L.L.C.
**Purpose**: AI-powered learning assistance (Tutor feature)
**Location**: United States
**Data Processed**:
- User messages to AI Tutor
- Educational context and learning goals
- Quest-related information
- Conversation history

**Services Provided**:
- Natural language processing
- AI-powered tutoring responses
- Learning assistance and explanations

**Security Measures**:
- SOC 2 Type II compliant
- Encryption in transit and at rest
- Data retention policies (30 days for API usage)
- No training on user data without explicit consent
- Enterprise-grade security

**Important Notes**:
- Tutor feature is optional
- Users can choose not to use AI features
- Conversations may be reviewed for safety purposes
- Data is not used to train AI models without consent

**Data Processing Agreement**: Available for Enterprise customers
**Website**: https://openai.com
**Privacy Policy**: https://openai.com/privacy
**API Data Usage**: https://openai.com/policies/api-data-usage-policies

---

### 5. Google LLC (Gemini API)
**Purpose**: Alternative AI-powered learning assistance
**Location**: United States (global infrastructure)
**Data Processed**:
- User messages to AI Tutor
- Educational context and learning goals
- Quest-related information

**Services Provided**:
- Natural language processing
- AI-powered tutoring responses
- Alternative AI provider for redundancy

**Security Measures**:
- ISO 27001 certified
- SOC 2 and SOC 3 compliant
- Encryption in transit and at rest
- GDPR compliant
- Regular security audits

**Important Notes**:
- Used as alternative/backup AI provider
- Same data protection standards as OpenAI
- Users can opt out of AI features entirely

**Data Processing Agreement**: Available through Google Cloud Platform
**Website**: https://cloud.google.com/vertex-ai
**Privacy Policy**: https://policies.google.com/privacy

---

### 6. Google Analytics 4
**Purpose**: Website analytics and usage insights
**Location**: United States (global infrastructure)
**Data Processed**:
- Anonymized user behavior data
- Page views and navigation paths
- Device and browser information
- Geographic location (country/city level)
- Session duration and engagement metrics

**Services Provided**:
- Website traffic analysis
- User behavior insights
- Conversion tracking
- Demographic insights

**Security Measures**:
- ISO 27001 certified
- GDPR compliant with data processing amendment
- IP anonymization enabled
- Data retention controls
- User opt-out capabilities

**Important Notes**:
- IP addresses are anonymized
- No personally identifiable information is sent to Google Analytics
- Users can opt out via browser settings or extensions
- Cookie consent mechanism in place (where required)

**Data Processing Agreement**: Available through Google Analytics
**Website**: https://analytics.google.com
**Privacy Policy**: https://policies.google.com/privacy

---

## Data Processing Safeguards

### Contractual Protections
All subprocessors are required to:
- Sign Data Processing Agreements (DPAs) that comply with GDPR Article 28
- Implement appropriate technical and organizational security measures
- Only process data according to our instructions
- Assist with data subject rights requests
- Notify us of data breaches within 24 hours
- Allow audits and inspections
- Delete or return data upon contract termination

### Security Requirements
All subprocessors must implement:
- Encryption at rest and in transit
- Access controls and authentication
- Regular security audits and assessments
- Incident response procedures
- Business continuity and disaster recovery plans
- Employee security training
- Regular security updates and patches

### Compliance Certifications
We prioritize subprocessors with recognized security certifications:
- SOC 2 Type II (minimum requirement)
- ISO 27001 (preferred)
- PCI DSS (for payment processors)
- GDPR compliance (required)
- COPPA compliance (where applicable)

## Data Transfers

### International Transfers
- Primary infrastructure is located in the United States
- Some subprocessors may process data in multiple regions for redundancy
- We implement appropriate safeguards for international transfers:
  - Standard Contractual Clauses (SCCs)
  - Adequacy decisions where applicable
  - Additional security measures beyond regulatory requirements

### EU Users
For users in the European Economic Area:
- Data may be transferred to the United States
- We rely on Standard Contractual Clauses approved by the European Commission
- Subprocessors implement supplementary measures to protect EU data
- Users have the right to object to international transfers

## User Rights

Users have the right to:
- Request information about how subprocessors process their data
- Object to processing by specific subprocessors (may limit service functionality)
- Request deletion of data processed by subprocessors
- Receive a copy of their data in a portable format

To exercise these rights, contact: privacy@optioeducation.com

## Subprocessor Changes

### Notification Process
When we add or change a subprocessor, we will:
1. Update this document
2. Send email notification to users (for material changes)
3. Provide 30 days notice before new subprocessor processes data
4. Allow users to object during notice period

### User Objections
If you object to a new subprocessor:
- Contact us within 30 days of notification
- We will work to find an alternative solution
- If no solution is found, you may terminate your account and request data deletion

## Contact Information

For questions about our subprocessors:
- **Privacy**: privacy@optioeducation.com
- **Security**: security@optioeducation.com
- **Support**: support@optioeducation.com

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 30, 2025 | Initial subprocessor list created |

---

**Last Reviewed**: January 30, 2025
**Next Review**: July 30, 2025 (or sooner if subprocessors change)