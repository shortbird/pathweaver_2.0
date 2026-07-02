# OSH (OurSchoolHangout) iCreate Registration — Field Inventory

Extracted 2026-07-01 from saved copies of icreatecollab.ourschoolhangout.com/Account-Setup
(source saves in repo-root `OSH Form/`, untracked). The OSH flow is ONE long wizard page;
all six saves contain the same form. This is the source-of-truth inventory for porting the
flow into Optio's iCreate funnel (`/register/icreate/<code>`).

## Step 1 — Primary (parent) account
- First Name, Last Name, Preferred First Name
- Email Address
- Street Address, Street Address 2, City, State (dropdown), Country (dropdown), Zip
- Birthday (Month/Day/Year dropdowns)
- Cell Number (intl tel input), Phone Number (secondary)
- "Show in Directory" checkbox on nearly every field (OSH community-directory feature)
- Volunteer to be on a committee! (dropdown): Events, Building Maintenance, Marketing,
  Class Prep, Classroom help / Substitute, Theater
- Media Consent Form (dropdown): "I consent for myself and my children" / "I do not consent"
  (full grant-of-permission text in the label — reuse verbatim)
- Timezone (dropdown)
- Password + Confirm Password
- Family Notifications: "Receive My Notifications Only" checkbox
- reCAPTCHA

## Step 2 — Questions
- Special Needs (dropdown; intro text: "iCreate is not staffed or equipped to provide
  specialized care for children with special needs. If your child has special needs of any
  kind, please contact us before enrolling…"):
  - No special needs
  - Minor special needs - I will contact you!
  - My child needs specialized care - I will contact you!
- Form of Payment ("Payment is due by Aug 22… select all that apply"), checkboxes:
  - Self-Pay
  - OpenED
  - Harmony Educational Services
  - Utah Fits All
  - Other Funding
  - I will pay and get reimbursed

## Step 3 — Terms and Conditions (two e-sign blocks)
### 3a. Financial Contract & Liability Waiver Acknowledgment
- "I have read and agree to the Financial Contract" (View Financial Contract » link)
- "I have read and agree to the Liability Waiver" (View Liability Waiver » link)
- Financial Contract Summary (displayed inline):
  - Registering commits to the entire school year 2025-26 (prorated if registering late)
  - Payment options: discounted one-time payment, or 9 monthly payments
  - Payments in full due by August 22
  - Monthly payments due the 22nd of each month; first Aug 22, last April 22
  - $20 late fee after 5 days late; >30 days late may mean dismissal
  - Scholarship/reimbursement payers: contact to avoid late fees
  - Card fee 2.95% + $1.25/transaction online/autopay; $1.25 for e-check
  - Insufficient funds: $35
  - Pay by credit/debit, check, or scholarship money; autopay suggested for monthly
  - Refunds: registration fee non-refundable; tuition less 10% refundable through Sept 8,
    after that transfer/sell your contract
  - Add/Drop: all class changes by Monday, Sept 8
- Checkbox: "I confirm I have read and agree to the above terms and conditions"
- Type Your Full Name (e-signature) + checkbox: "By typing my name above, I understand and
  agree this form of electronic signature has the same legal force and effect as a manual
  written signature."

### 3b. Policy Acknowledgment
- I agree to abide by all iCreate Collaborative policies and guidelines.
- I will familiarize myself with these policies by reading the Family Guidebook and/or
  attending or watching the recording of the Parent Orientation Meeting.
- I understand all official documents/resources are in the RESOURCE section.
- I understand staying informed is my responsibility as part of the iCreate community.
- Same confirm checkbox + typed-name e-signature block.

## Step 4 — Interest tags (skippable)
Directory-matching tags: Animals, Arts/Crafts, Board Games, Cars, Cooking, Dance,
DIY Projects, Drawing/Painting, Entrepreneurship, Gardening, Lego, Music, Natural Health,
Outdoor Activities, Patriotism, Running, Service, Sewing, Sports, STEM, Technology,
Theater, Travel.

## Step 5 — Family members (repeatable add-member modal)
Guidance: add children + all family members allowed to pick up your child + emergency
contacts; pick the correct profile type.
Per member:
- Profile Type (dropdown): Child, Parent, Emergency Contact, Grandparent, Guardian
- Allowed To Pickup & Drop Off (checkbox)
- First Name, Last Name, Preferred First Name
- Gender (dropdown: Female/Male; "Only Visible to Staff")
- Email ("receives a copy of emails sent to the primary account")
- Address block (street/city/state/country/zip)
- Date Of Birth (M/D/Y dropdowns) + age display
  - "Why is birthday required?" explainer (age requirements for classes/events)
- Cell Number, Telephone
- Allergies (textarea, REQUIRED, "Only Visible to Staff")
- Required Medications (textarea, REQUIRED, "Only Visible to Staff")
- Timezone, Notifications ("Receive All Family Members")
- Interest tags (same list as step 4)

## Step 6 — Profile + cover pictures (skippable)
Upload per family member; "you can skip this step".

## Finish — confirmation messages
- Instant: "Thank you for submitting your account setup form… You will receive an email
  shortly with your login details."
- Admin-approval variant: "…new accounts require approval by the school administrator
  before access is granted. You will receive an email notification once your account has
  been approved, along with your login details."

## Notes for the Optio port
- Optio's funnel already covers: parent account (name/email/password), kids
  (DOB-driven dependent vs 13+), paperwork e-sign blocks, fee step, scheduling handoff.
- OSH-specific data Optio does NOT yet capture: address/phone, preferred name, gender,
  media consent, special-needs screen, form-of-payment intent, allergies/medications,
  pickup permission + emergency contacts at registration, interest tags,
  committee volunteering, profile photos, directory visibility.
- SIS already has an emergency-contacts model (per student + per household) and
  households; those are the natural landing spots for pickup/emergency data.
