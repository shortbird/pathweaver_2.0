-- ROLLBACK for 20260802_revoke_data_api_on_student_work.sql
-- Captured from production 2026-08-02 immediately before applying.
-- Restores the exact policies and grants that existed. Use only if the revoke
-- breaks a consumer nobody knew about; the exposure returns with it.

begin;

alter table public.diplomas no force row level security;
alter table public.user_task_evidence_documents no force row level security;
alter table public.evidence_document_blocks no force row level security;
alter table public.user_skill_xp no force row level security;
alter table public.user_mastery no force row level security;

create policy "diplomas_insert" on public.diplomas
  as permissive for insert to public
  with check (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
create policy "diplomas_select" on public.diplomas
  as permissive for select to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (is_public = true) OR is_admin()));
create policy "diplomas_update" on public.diplomas
  as permissive for update to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()))
  with check (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
create policy "Users can delete blocks from their own documents" on public.evidence_document_blocks
  as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))));
create policy "Users can insert blocks into their own documents" on public.evidence_document_blocks
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))));
create policy "Users can update blocks in their own documents" on public.evidence_document_blocks
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))));
create policy "evidence_document_blocks_select" on public.evidence_document_blocks
  as permissive for select to public
  using (((document_id IN ( SELECT user_task_evidence_documents.id
   FROM user_task_evidence_documents
  WHERE (user_task_evidence_documents.user_id = ( SELECT auth.uid() AS uid)))) OR (document_id IN ( SELECT utd.id
   FROM user_task_evidence_documents utd
  WHERE ((utd.status = 'completed'::text) AND (EXISTS ( SELECT 1
           FROM diplomas
          WHERE ((diplomas.user_id = utd.user_id) AND (diplomas.is_public = true)))))))));
create policy "user_mastery_select" on public.user_mastery
  as permissive for select to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM diplomas
  WHERE ((diplomas.user_id = user_mastery.user_id) AND (diplomas.is_public = true))))));
create policy "user_skill_xp_select" on public.user_skill_xp
  as permissive for select to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM diplomas
  WHERE ((diplomas.user_id = user_skill_xp.user_id) AND (diplomas.is_public = true))))));
create policy "Users can delete their own evidence documents" on public.user_task_evidence_documents
  as permissive for delete to public
  using ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users can insert their own evidence documents" on public.user_task_evidence_documents
  as permissive for insert to public
  with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users can update their own evidence documents" on public.user_task_evidence_documents
  as permissive for update to public
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
create policy "user_task_evidence_documents_select" on public.user_task_evidence_documents
  as permissive for select to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR ((status = 'completed'::text) AND (EXISTS ( SELECT 1
   FROM diplomas
  WHERE ((diplomas.user_id = user_task_evidence_documents.user_id) AND (diplomas.is_public = true)))))));

grant delete, insert, references, select, trigger, truncate, update on public.diplomas to anon;
grant delete, insert, references, select, trigger, truncate, update on public.diplomas to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.evidence_document_blocks to anon;
grant delete, insert, references, select, trigger, truncate, update on public.evidence_document_blocks to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.user_mastery to anon;
grant delete, insert, references, select, trigger, truncate, update on public.user_mastery to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.user_skill_xp to anon;
grant delete, insert, references, select, trigger, truncate, update on public.user_skill_xp to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.user_task_evidence_documents to anon;
grant delete, insert, references, select, trigger, truncate, update on public.user_task_evidence_documents to authenticated;

commit;
