-- A credit partner's price is set per partner in its MOU (Tanner, 2026-10-13:
-- "Per partner, no default"). The $50 default made a new offering bill $50 a
-- student a month unless someone remembered to change it, which is not what
-- the signed MOUs say ($100 a student a term). Every insert now names its own
-- price. Latticework keeps the $50 it was created with.

ALTER TABLE public.partner_offerings ALTER COLUMN monthly_fee_cents DROP DEFAULT;
