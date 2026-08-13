-- ROLLBACK for 20260803_revoke_data_api_on_bounties_and_attachments.sql
-- Captured from production 2026-08-03 immediately before applying, by
-- reconstructing pg_policies verbatim. Restores the exact policies and grants
-- that existed. Use only if the revoke breaks a consumer nobody knew about; the
-- exposure returns with it (all 17 bounties and all 21 curriculum_attachments
-- become readable by the public anon key again).
--
-- The `Service role full access on bounties` policy is not recreated here
-- because the forward migration does not drop it.

begin;

alter table public.bounties               no force row level security;
alter table public.curriculum_attachments no force row level security;

create policy "Anyone can view active bounties" on public.bounties
  as permissive for select to public
  using (((status = 'active'::text) OR (poster_id = ( SELECT auth.uid() AS uid))));

create policy "Users can create bounties" on public.bounties
  as permissive for insert to public
  with check ((poster_id = ( SELECT auth.uid() AS uid)));

create policy "Posters can update own bounties" on public.bounties
  as permissive for update to public
  using ((poster_id = ( SELECT auth.uid() AS uid)))
  with check ((poster_id = ( SELECT auth.uid() AS uid)));

create policy "Posters can delete own draft bounties" on public.bounties
  as permissive for delete to public
  using (((poster_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::text)));

create policy "curriculum_attachments_org_isolation" on public.curriculum_attachments
  as permissive for select to public
  using (((organization_id IS NULL) OR (organization_id IN ( SELECT users.organization_id
     FROM users
    WHERE (users.id = ( SELECT auth.uid() AS uid))))));

create policy "curriculum_attachments_insert" on public.curriculum_attachments
  as permissive for insert to public
  with check (((organization_id IS NULL) OR (organization_id IN ( SELECT users.organization_id
     FROM users
    WHERE (users.id = ( SELECT auth.uid() AS uid))))));

create policy "curriculum_attachments_update" on public.curriculum_attachments
  as permissive for update to public
  using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
     FROM users
    WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'educator'::text, 'admin'::text, 'superadmin'::text])))))));

create policy "curriculum_attachments_delete" on public.curriculum_attachments
  as permissive for delete to public
  using (((uploaded_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
     FROM users
    WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'educator'::text, 'admin'::text, 'superadmin'::text])))))));

grant select, insert, update, delete, references, trigger, truncate
  on public.bounties               to anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate
  on public.curriculum_attachments to anon, authenticated;

commit;
