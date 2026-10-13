-- Transfer credit is priced by where it came from (shared/data/pricing.json,
-- "transfer"): credit on an accredited school's official transcript is free,
-- anything else is reviewed and costs the student's credit price. Nothing
-- recorded which was which, so the reviewer says so per school row. Existing
-- rows start unaccredited until someone marks them -- the credit report shows
-- the cost, and under-marking shows a fee the office can correct before
-- sending, where over-marking would quietly waive one.

ALTER TABLE public.transfer_credits
    ADD COLUMN IF NOT EXISTS accredited boolean NOT NULL DEFAULT false;
