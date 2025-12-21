# Render Service Cleanup Guide

**Created**: December 2025 (P3-DX-2)
**Status**: Services suspended, ready for deletion
**Risk**: Low (all services already suspended, no traffic)

## Current Service Inventory

### Active Services (KEEP - 4 services)

1. **optio-prod-frontend**
   - ID: `srv-d2to04vfte5s73ae97ag`
   - Type: Static Site
   - Branch: `main`
   - URL: https://optio-prod-frontend.onrender.com
   - Status: Active (not_suspended)
   - Purpose: Production frontend

2. **optio-prod-backend**
   - ID: `srv-d2to00vfte5s73ae9310`
   - Type: Web Service (Python)
   - Branch: `main`
   - URL: https://optio-prod-backend.onrender.com
   - Status: Active (not_suspended)
   - Purpose: Production backend

3. **optio-dev-frontend**
   - ID: `srv-d2tnvrffte5s73ae8s4g`
   - Type: Static Site
   - Branch: `develop`
   - URL: https://optio-dev-frontend.onrender.com
   - Status: Active (not_suspended)
   - Purpose: Development frontend

4. **optio-dev-backend**
   - ID: `srv-d2tnvlvfte5s73ae8npg`
   - Type: Web Service (Python)
   - Branch: `develop`
   - URL: https://optio-dev-backend.onrender.com
   - Status: Active (not_suspended)
   - Purpose: Development backend

### Suspended Services (DELETE - 7 services)

1. **optio-backend-dev-v2**
   - ID: `srv-d2tnouh5pdvs739ohha0`
   - Type: Web Service (Python)
   - Branch: `develop`
   - URL: https://optio-backend-dev-v2.onrender.com
   - Status: Suspended (user)
   - Last Updated: 2025-12-13
   - Reason: Replaced by optio-dev-backend

2. **optio-frontend-dev-new**
   - ID: `srv-d2tnm3re5dus73e155u0`
   - Type: Static Site
   - Branch: `develop`
   - URL: https://optio-frontend-dev-new.onrender.com
   - Status: Suspended (user)
   - Last Updated: 2025-12-13
   - Reason: Replaced by optio-dev-frontend

3. **optio-backend-dev-new**
   - ID: `srv-d2tnm1uuk2gs73d2cqk0`
   - Type: Web Service (Python)
   - Branch: `develop`
   - URL: https://optio-backend-dev-new.onrender.com
   - Status: Suspended (user)
   - Last Updated: 2025-12-13
   - Reason: Replaced by optio-dev-backend

4. **optio-frontend-dev**
   - ID: `srv-d2s8ravdiees73bfll10`
   - Type: Static Site
   - Branch: `develop`
   - URL: https://optio-frontend-dev.onrender.com
   - Status: Suspended (user)
   - Last Updated: 2025-12-13
   - Reason: Old development frontend (superseded)

5. **optio-backend-dev**
   - ID: `srv-d2s8r8be5dus73ddp8h0`
   - Type: Web Service (Python)
   - Branch: `develop`
   - URL: https://optio-backend-dev.onrender.com
   - Status: Suspended (user)
   - Last Updated: 2025-12-13
   - Reason: Old development backend (superseded)

6. **Optio_FE**
   - ID: `srv-d2r79t7diees73dvcbig`
   - Type: Static Site
   - Branch: `main`
   - URL: https://optio-fe.onrender.com
   - Status: Suspended (user)
   - Last Updated: 2025-12-13
   - Reason: Old production frontend (superseded)

7. **Optio**
   - ID: `srv-d2po3n6r433s73dhcuig`
   - Type: Web Service (Python)
   - Branch: `main`
   - URL: https://optio-8ibe.onrender.com
   - Status: Suspended (user)
   - Last Updated: 2025-12-13
   - Reason: Original backend (superseded)

## Deletion Command

To delete these services, you can use the Render dashboard or contact support, as the Render MCP does not currently support service deletion via API.

### Option 1: Delete via Render Dashboard

1. Go to https://dashboard.render.com
2. For each suspended service:
   - Click on the service name
   - Click "Settings" tab
   - Scroll to bottom and click "Delete Service"
   - Confirm deletion

Services to delete:
- optio-backend-dev-v2
- optio-frontend-dev-new
- optio-backend-dev-new
- optio-frontend-dev
- optio-backend-dev
- Optio_FE
- Optio

### Option 2: Contact Render Support

If you want to bulk delete, you can contact Render support with the service IDs listed above.

## Pre-Deletion Checklist

Before deleting, verify:
- [ ] All 4 active services are functioning correctly
- [ ] No environment variables from suspended services are needed
- [ ] No custom domains pointed to suspended services
- [ ] No hardcoded URLs in code referencing suspended services
- [ ] Git branches still exist (services can be recreated if needed)

## Cost Savings

Suspended services on Render's free tier don't incur costs, but they do clutter the dashboard. Deleting them will:
- Clean up the Render dashboard
- Prevent accidental deployments to old services
- Improve developer experience (less confusion)

## Rollback Plan

If you accidentally delete the wrong service or need to recreate one:
1. Go to Render dashboard
2. Click "New +" → "Web Service" or "Static Site"
3. Connect GitHub repo: https://github.com/shortbird/pathweaver_2.0
4. Select appropriate branch (develop or main)
5. Configure build/start commands (see active services for reference)
6. Deploy

## Final Architecture

After cleanup, you'll have a clean 4-service setup:
```
Production (main branch):
├── optio-prod-backend  → https://optio-prod-backend.onrender.com
└── optio-prod-frontend → https://optio-prod-frontend.onrender.com

Development (develop branch):
├── optio-dev-backend  → https://optio-dev-backend.onrender.com
└── optio-dev-frontend → https://optio-dev-frontend.onrender.com
```

## Status

- [x] Services identified
- [x] Services suspended
- [ ] Services deleted (MANUAL - requires dashboard access)

**NOTE**: Service deletion must be done manually via Render dashboard. This is a destructive operation that cannot be undone via API. Proceed with caution.
