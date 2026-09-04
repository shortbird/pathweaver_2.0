-- The class parent chat is named for its audience.
--
-- Both of a class's group chats were created by class_group_sync_service: the
-- adults' one as "<Class> Class Chat" and the students' one as "<Class> Student
-- Chat". Read side by side in a Messages list, "Class Chat" is the one that
-- looks like it reaches the class -- so a teacher wrote to her students in the
-- parent chat for two days and could not work out why none of them replied
-- (iCreate, 2026-09-03: "one teacher was sending messages to her students but
-- they were not receiving them. The students saw each others messages, just not
-- the teachers"). Her four messages are in the parent chat; the students' are in
-- the student chat.
--
-- The service now generates "<Class> Parent Chat" and heals a stale auto-name on
-- its next run, but a sync only runs when the roster changes or a teacher opens
-- the class Messages tab -- so the ~200 existing rows are renamed here instead of
-- drifting for a term.
--
-- Only rows whose name is exactly what the service generated are touched: a
-- group a school renamed by hand does not match the pattern and keeps its name.
update group_conversations
   set name = regexp_replace(name, ' Class Chat$', ' Parent Chat')
 where audience = 'family'
   and source_class_id is not null
   and name like '% Class Chat';
