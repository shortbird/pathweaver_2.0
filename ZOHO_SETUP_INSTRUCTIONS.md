# Zoho CRM Setup Instructions - Manual Steps
**For Optio Education Platform Integration**

This guide contains the **manual steps YOU need to complete** in the Zoho web interface. Claude Code will handle all the backend code implementation.

---

## Table of Contents
1. [Step 1: Create Zoho CRM Account](#step-1-create-zoho-crm-account)
2. [Step 2: Configure Custom Fields](#step-2-configure-custom-fields)
3. [Step 3: Set Up OAuth 2.0 App](#step-3-set-up-oauth-20-app)
4. [Step 4: Generate Refresh Token](#step-4-generate-refresh-token)
5. [Step 5: Set Up Redis (Local Development)](#step-5-set-up-redis-local-development)
6. [What Happens Next](#what-happens-next)

---

## Step 1: Create Zoho CRM Account

### 1.1 Sign Up for Zoho CRM

**Time Required**: 5-10 minutes

1. **Go to**: https://www.zoho.com/crm/signup.html

2. **Choose Plan**: Click **"Standard"** plan
   - Cost: $14/user/month
   - Features: 5,000 API credits/day, custom fields, workflow automation
   - **Important**: Choose the **US data center** (or closest to your users)

3. **Enter Your Details**:
   - Work Email: `tanner@optioeducation.com` (or your preferred email)
   - Company Name: `Optio Education`
   - Number of Employees: Choose appropriate option
   - Phone Number: Your phone number

4. **Complete Registration**:
   - Check your email for verification link
   - Click verification link to activate account
   - Set a strong password (save it in your password manager!)

5. **Initial Setup Wizard**:
   - When prompted, select industry: **"Education"**
   - Skip the import data step (we'll sync programmatically)
   - Skip the team invitation step (you can add team members later)

### 1.2 Verify API Access is Enabled

1. **Log in to Zoho CRM**: https://crm.zoho.com/

2. **Navigate to Settings**:
   - Click the **gear icon** (⚙️) in the top-right corner
   - Select **"Setup"** from dropdown

3. **Enable Developer Space**:
   - In the left sidebar, scroll to **"Developer Space"**
   - Click **"APIs"**
   - Click **"API Access"** tab
   - Ensure the toggle is **ON** (green)
   - If it says "Request API Access", click the button and wait for approval (usually instant for Standard plans)

**✅ Checkpoint**: You should see "API Access Enabled" status

---

## Step 2: Configure Custom Fields

**Time Required**: 15-20 minutes

We need to create 20 custom fields on the **Contacts** module to store Optio user data.

### 2.1 Navigate to Custom Fields

1. **Go to Settings** (gear icon ⚙️ → Setup)

2. **Navigate to Customization**:
   - Left sidebar → **"Customization"**
   - Click **"Modules and Fields"**

3. **Select Contacts Module**:
   - Find **"Contacts"** in the list
   - Click on it to open the module editor

4. **Open Fields Section**:
   - You'll see tabs: Layout, Fields, Related Lists, etc.
   - Click on **"Fields"** tab

### 2.2 Create Custom Fields (One by One)

For each field below, follow these steps:

**General Process**:
1. Click **"+ New Custom Field"** button (top-right)
2. Select the **Field Type** specified below
3. Enter the **Field Label** exactly as shown
4. Set **Length** (for Text fields) or **Decimal Places** (for Number fields)
5. Check **"Unique"** if specified (prevents duplicates)
6. Click **"Save"**

---

#### **Field 1: External ID** (MOST IMPORTANT)
- **Field Type**: Single Line Text
- **Field Label**: `External ID`
- **Length**: 255
- **Unique**: ✅ **Check this box** (critical for deduplication)
- **Mandatory**: Leave unchecked
- **API Name**: Will auto-generate as `External_ID__c`

**Purpose**: Stores Optio user UUID for syncing

---

#### **Field 2: Display Name**
- **Field Type**: Single Line Text
- **Field Label**: `Display Name`
- **Length**: 100
- **Unique**: Unchecked

---

#### **Field 3: User Type**
- **Field Type**: Pick List (Dropdown)
- **Field Label**: `User Type`
- **Pick List Values** (add these one by one):
  - `Student`
  - `Parent`
  - `Advisor`
  - `Admin`
  - `Observer`
- **Default Value**: `Student`

---

#### **Field 4: Signup Date**
- **Field Type**: Date
- **Field Label**: `Signup Date`

---

#### **Field 5: Total XP**
- **Field Type**: Number
- **Field Label**: `Total XP`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 6: Level**
- **Field Type**: Single Line Text
- **Field Label**: `Level`
- **Length**: 50

---

#### **Field 7: Active Quests**
- **Field Type**: Number
- **Field Label**: `Active Quests`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 8: Completed Quests**
- **Field Type**: Number
- **Field Label**: `Completed Quests`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 9: Tasks Completed**
- **Field Type**: Number
- **Field Label**: `Tasks Completed`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 10: Badges Earned**
- **Field Type**: Number
- **Field Label**: `Badges Earned`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 11: Current Streak**
- **Field Type**: Number
- **Field Label**: `Current Streak`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 12: XP STEM**
- **Field Type**: Number
- **Field Label**: `XP STEM`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 13: XP Wellness**
- **Field Type**: Number
- **Field Label**: `XP Wellness`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 14: XP Communication**
- **Field Type**: Number
- **Field Label**: `XP Communication`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 15: XP Civics**
- **Field Type**: Number
- **Field Label**: `XP Civics`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 16: XP Art**
- **Field Type**: Number
- **Field Label**: `XP Art`
- **Decimal Places**: 0
- **Default Value**: 0

---

#### **Field 17: Portfolio URL**
- **Field Type**: URL
- **Field Label**: `Portfolio URL`
- **Length**: 255

---

#### **Field 18: Parent Linked**
- **Field Type**: Checkbox (Boolean)
- **Field Label**: `Parent Linked`
- **Default Value**: Unchecked

---

#### **Field 19: LMS Platform**
- **Field Type**: Pick List (Dropdown)
- **Field Label**: `LMS Platform`
- **Pick List Values**:
  - `None`
  - `Canvas`
  - `Google Classroom`
  - `Schoology`
  - `Moodle`
- **Default Value**: `None`

---

### 2.3 Verify All Fields Created

1. **Go back to Contacts → Fields tab**
2. **Scroll down** to the "Custom Fields" section
3. **Verify you see all 19 fields** listed

**✅ Checkpoint**: You should see all custom fields with API names ending in `__c`

**Screenshot what you see**: Save a screenshot of the custom fields list for reference

---

## Step 3: Set Up OAuth 2.0 App

**Time Required**: 10 minutes

This creates the OAuth credentials that allow Optio's backend to communicate with Zoho CRM.

### 3.1 Navigate to Zoho API Console

1. **Open new tab**: https://api-console.zoho.com/

2. **Sign in** with your Zoho CRM account (same email/password)

3. **You should see**: "API Console" dashboard

### 3.2 Create OAuth Client

1. **Click "Add Client"** button (top-right, blue button)

2. **Choose Client Type**: Select **"Server-based Applications"**
   - This is correct for backend API integration
   - Click **"Next"** or **"Create Now"**

3. **Fill in Client Details**:

   **Client Name**: `Optio Education Platform`

   **Homepage URL**: `https://www.optioeducation.com`

   **Authorized Redirect URIs** (add TWO URLs):
   - First URI: `https://optio-prod-backend.onrender.com/api/zoho/oauth/callback`
   - Click **"+ Add"** to add second URI
   - Second URI: `https://optio-dev-backend.onrender.com/api/zoho/oauth/callback`

   **Client Domain**: Leave blank (not required)

   **Client Type**: Already selected as "Server-based"

4. **Click "Create"**

### 3.3 Copy Client Credentials

After creation, you'll see a screen with **Client ID** and **Client Secret**.

**🔒 IMPORTANT - Save These Credentials Immediately**:

1. **Copy Client ID**:
   - Looks like: `1000.XXXXXXXXXXXXXXXXXXXXX`
   - Save to password manager or secure note

2. **Copy Client Secret**:
   - Looks like: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (32 characters)
   - **CRITICAL**: This is shown ONLY ONCE! If you lose it, you'll need to regenerate
   - Save to password manager or secure note

**✅ Checkpoint**: You have both Client ID and Client Secret saved securely

### 3.4 Configure Scopes

1. **In the API Console**, click on your newly created client name

2. **Click "Edit"** button (or "Manage Scopes" tab)

3. **Select the following scopes** (check the boxes):
   - ✅ `ZohoCRM.modules.ALL` - Read and write access to CRM modules (Contacts, etc.)
   - ✅ `ZohoCRM.settings.ALL` - Access to CRM settings and custom fields
   - ✅ `ZohoCRM.bulk.ALL` - Bulk read/write operations (essential for performance)

4. **Click "Update"** or **"Save"**

**✅ Checkpoint**: You see the 3 scopes listed under your client

---

## Step 4: Generate Refresh Token

**Time Required**: 10 minutes

**⚠️ CRITICAL STEP**: This is the most technical part. Follow carefully.

The refresh token allows Optio to automatically refresh access tokens without user intervention.

### 4.1 Generate Authorization Code

1. **Open Notepad** or text editor

2. **Copy this URL template**:
   ```
   https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.bulk.ALL&client_id=YOUR_CLIENT_ID&response_type=code&access_type=offline&redirect_uri=https://optio-prod-backend.onrender.com/api/zoho/oauth/callback
   ```

3. **Replace `YOUR_CLIENT_ID`** with your actual Client ID from Step 3.3

4. **Example** (if your Client ID is `1000.ABC123XYZ`):
   ```
   https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.bulk.ALL&client_id=1000.ABC123XYZ&response_type=code&access_type=offline&redirect_uri=https://optio-prod-backend.onrender.com/api/zoho/oauth/callback
   ```

5. **Copy the complete URL** and **paste it into your browser address bar**

6. **Press Enter**

### 4.2 Authorize the App

1. **You'll see a Zoho authorization page** asking:
   ```
   "Optio Education Platform would like to access your Zoho CRM"
   ```

2. **Review the permissions** (should match the scopes you selected)

3. **Click "Accept"** or **"Authorize"**

### 4.3 Extract Authorization Code

1. **After clicking Accept**, your browser will redirect to:
   ```
   https://optio-prod-backend.onrender.com/api/zoho/oauth/callback?code=XXXXXXXXXX
   ```

2. **This page will show an error** (404 or connection failed) - **THIS IS EXPECTED!**
   - The endpoint doesn't exist yet (we'll create it in code)
   - The important part is the **`code=XXXXXXXXXX`** in the URL

3. **Copy the code from the URL**:
   - Look at the browser address bar
   - Copy everything after **`code=`** and before **`&`** (if there's an `&`)
   - Example: If URL is `...callback?code=1000.abc123xyz.def456&state=...`
   - Copy: `1000.abc123xyz.def456`

4. **Save this code immediately** - it expires in **60 seconds**!

**⏰ IMPORTANT**: Complete Step 4.4 immediately (within 60 seconds)

### 4.4 Exchange Code for Refresh Token

**This step requires command line - follow carefully**:

1. **Open Command Prompt** (Windows) or **Terminal** (Mac/Linux)
   - Windows: Press `Win + R`, type `cmd`, press Enter
   - Mac: Press `Cmd + Space`, type `terminal`, press Enter

2. **Copy this curl command template**:
   ```bash
   curl -X POST "https://accounts.zoho.com/oauth/v2/token" -d "code=YOUR_AUTHORIZATION_CODE" -d "redirect_uri=https://optio-prod-backend.onrender.com/api/zoho/oauth/callback" -d "client_id=YOUR_CLIENT_ID" -d "client_secret=YOUR_CLIENT_SECRET" -d "grant_type=authorization_code"
   ```

3. **Replace the following placeholders**:
   - `YOUR_AUTHORIZATION_CODE` → Code from Step 4.3
   - `YOUR_CLIENT_ID` → Client ID from Step 3.3
   - `YOUR_CLIENT_SECRET` → Client Secret from Step 3.3

4. **Example** (with fake values):
   ```bash
   curl -X POST "https://accounts.zoho.com/oauth/v2/token" -d "code=1000.abc123.xyz789" -d "redirect_uri=https://optio-prod-backend.onrender.com/api/zoho/oauth/callback" -d "client_id=1000.ABC123XYZ" -d "client_secret=secretkey123456" -d "grant_type=authorization_code"
   ```

5. **Paste the command** into your terminal/command prompt

6. **Press Enter**

### 4.5 Extract Refresh Token

1. **You'll see a JSON response** like this:
   ```json
   {
     "access_token": "1000.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
     "refresh_token": "1000.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
     "expires_in": 3600,
     "api_domain": "https://www.zohoapis.com",
     "token_type": "Bearer"
   }
   ```

2. **Copy the `refresh_token` value**:
   - It's the long string after `"refresh_token": "`
   - Usually starts with `1000.`
   - Example: `1000.abc123xyz789def456ghi012jkl345mno678pqr901`

3. **🔒 CRITICAL - Save This Refresh Token Securely**:
   - This token **never expires** (unless revoked)
   - It's equivalent to a password - protect it carefully
   - Save to password manager or secure note
   - Label it: "Zoho CRM Refresh Token for Optio"

**✅ Checkpoint**: You have the refresh token saved securely

**❌ If you get an error**:
- `"error": "invalid_code"` → The authorization code expired (60 seconds). Go back to Step 4.1 and start over
- `"error": "invalid_client"` → Check your Client ID and Client Secret are correct
- `"error": "redirect_uri_mismatch"` → Make sure the redirect_uri in the curl command EXACTLY matches what you set in API Console

---

## Step 5: Set Up Redis (Local Development)

**Time Required**: 5 minutes

Redis is used for Celery task queue (async sync operations).

### 5.1 Install Redis

**Windows**:
1. Download Redis from: https://github.com/microsoftarchive/redis/releases
2. Download the `.msi` installer (e.g., `Redis-x64-3.0.504.msi`)
3. Run the installer
4. Accept default settings (Port 6379)
5. Check "Add Redis to PATH" if available

**Mac**:
```bash
brew install redis
```

**Linux (Ubuntu/Debian)**:
```bash
sudo apt-get update
sudo apt-get install redis-server
```

### 5.2 Start Redis Server

**Windows**:
1. Open Command Prompt as Administrator
2. Run: `redis-server`
3. You should see: "Ready to accept connections"

**Mac/Linux**:
```bash
redis-server
```

Or start as background service:
```bash
# Mac
brew services start redis

# Linux
sudo systemctl start redis-server
```

### 5.3 Verify Redis is Running

**Open a NEW terminal/command prompt** (keep Redis running in the first one):

```bash
redis-cli ping
```

**Expected Output**: `PONG`

**✅ Checkpoint**: Redis responds with PONG

---

## What Happens Next

### ✅ You've Completed All Manual Steps!

You now have:
- ✅ Zoho CRM account with Standard plan
- ✅ 19 custom fields created on Contacts module
- ✅ OAuth 2.0 app with Client ID and Client Secret
- ✅ Refresh token that never expires
- ✅ Redis running locally

### 🤖 Claude Code Will Now Handle:
1. **Creating all backend service code** (5 Python files)
2. **Setting up database migrations** (2 new tables)
3. **Implementing Celery tasks** (async sync)
4. **Creating webhook endpoints** (real-time sync)
5. **Writing configuration files**
6. **Updating environment variables**

### 📋 What to Provide to Claude Code

When you're done with Steps 1-4, send this message:

```
I've completed the Zoho setup! Here are my credentials:

Client ID: [paste your Client ID]
Client Secret: [paste your Client Secret]
Refresh Token: [paste your Refresh Token]

Redis is running locally and responds to ping.

Ready for you to implement the backend code!
```

**🔒 SECURITY NOTE**: These credentials will be stored as environment variables in Render (encrypted). Claude Code will never store them in plain text files.

---

## Troubleshooting

### Issue: Can't Find Custom Fields Option
**Solution**: Make sure you selected "Contacts" module, then clicked the "Fields" tab (not "Layout")

### Issue: Authorization Code Expired
**Solution**: The code expires in 60 seconds. Regenerate it by visiting the authorization URL again (Step 4.1)

### Issue: curl Command Not Found (Windows)
**Solution**: Use Git Bash instead of Command Prompt, or download curl from: https://curl.se/windows/

### Issue: Redis Won't Start
**Solution**:
- Check if another program is using port 6379: `netstat -an | findstr 6379`
- Try starting on different port: `redis-server --port 6380`

### Issue: Can't Select Multiple Scopes
**Solution**: Hold Ctrl (Windows) or Cmd (Mac) while clicking to select multiple items

---

## Questions?

If you encounter any issues during setup, take a screenshot and ask Claude Code:
```
"I'm stuck on Step X.Y - here's what I see [screenshot]. What should I do?"
```

Claude Code can help troubleshoot and guide you through any problems.

---

**Last Updated**: January 2025
**Document Version**: 1.0
**Status**: Ready for use
