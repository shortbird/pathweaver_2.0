-- Remove the SIS "Programs" concept entirely.
--
-- Programs were an optional grouping layer above classes; the SIS console now
-- manages classes directly (each class carries its own schedule, capacity, age
-- range, supply fee, image, etc.). No feature depends on programs — only iCreate
-- test data ever used them.
--
-- Drops the program_id association from classes + registration items, then the
-- programs table itself.

ALTER TABLE org_classes            DROP COLUMN IF EXISTS program_id;
ALTER TABLE sis_registration_items DROP COLUMN IF EXISTS program_id;
DROP TABLE IF EXISTS programs;
