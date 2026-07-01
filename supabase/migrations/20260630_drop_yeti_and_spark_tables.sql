-- DESTRUCTIVE — do not apply until the companion removal + wallet carve-out is
-- verified working locally (Treehouse coins, bounty rewards, XP awards).
--
-- Drops the retired Yeti virtual-pet tables and the Spark LMS integration table.
-- The spendable-XP balances that lived on yeti_pets were already migrated to
-- student_wallets by 20260630_create_student_wallets.sql, so dropping yeti_pets
-- does not lose coin balances.
--
-- yeti_interactions / yeti_inventory reference yeti_pets / yeti_items; CASCADE
-- covers the FK order regardless.

DROP TABLE IF EXISTS yeti_interactions CASCADE;
DROP TABLE IF EXISTS yeti_inventory CASCADE;
DROP TABLE IF EXISTS yeti_pets CASCADE;
DROP TABLE IF EXISTS yeti_items CASCADE;

-- Spark LMS integration (HMAC SSO + webhooks) removed 2026-06-30.
DROP TABLE IF EXISTS spark_auth_codes CASCADE;
