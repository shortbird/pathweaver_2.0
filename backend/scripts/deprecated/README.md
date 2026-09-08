# Deprecated Scripts

**Status**: Archived
**Date Deprecated**: December 2025
**Reason**: Create tables for features removed in Phase 2 refactoring

---

## Overview

This directory contains Python scripts that create database tables for deprecated features. These scripts are kept for historical reference only and should NOT be executed.

---

## Deprecated Scripts

### Subscription History Tables

#### create_subscription_history_table.py
Creates the `subscription_history` table for tracking subscription tier changes.

**Status**: DEPRECATED - Do NOT run
**Reason**: Subscription tier system removed in Phase 2 (January 2025)

#### create_subscription_history_simple.py
Simplified version of subscription history table creation.

**Status**: DEPRECATED - Do NOT run
**Reason**: Subscription tier system removed in Phase 2 (January 2025)

---

## Related Deprecated Migrations

See `backend/migrations/deprecated/` for SQL migration files related to subscription tiers and other removed features.

---

## What to Do Instead

For user billing and subscription management, use:
- Enterprise organization accounts (implemented December 2025)
- Organization-level billing through Stripe
- Contact sales for custom pricing

---

**Last Updated**: December 18, 2025
**Maintained By**: Development Team
**Status**: Archived - Do Not Modify
