"""
Tests for the Google Sheet master-schedule sync (sis_schedule_sync_service).

The fixture mirrors the real iCreate sheet layout: teacher columns, DAY rows,
"Block N - Class Title / Ages / Room" triplets, quoted titles with commas,
placeholder teacher columns, and messy age strings.
"""

import pytest

from services.sis_schedule_sync_service import (
    SheetSyncError, build_desired_classes, build_operations, csv_export_url,
    parse_ages, parse_clock, parse_day_names, parse_length_minutes,
    parse_master_grid, parse_schedule_csv, teaching_blocks,
)

SHEET_ID = '1gHm9dUwnAgZ5oGwGSsGYu8o1K3ew_gVur2MEJNUHE-o'

FIXTURE = '\r\n'.join([
    'Block,Ashley,Xavier,Teacher A (placeholder)',
    'TUESDAY,,,',
    'Block 1 - Class Title,Peak Play PE,Sword of Truth,Building America',
    'Block 1 - Ages,8-12,7-12,8-12',
    'Block 1 - Room,Great Hall,Theater Large,Elem 2',
    ',,,',
    'Block 2 - Class Title,Peak Play Jr PE,"Power, Policy & Profit: US Gov & Econ",',
    'Block 2 - Ages,5-9,14+,',
    'Block 2 - Room,Great Hall,Teen Large,',
    ',,,',
    'THURSDAY,,,',
    'Block 1 - Class Title,Peak Play PE,Sword of Truth,',
    'Block 1 - Ages,8-12,7-12,',
    'Block 1 - Room,Gym,Theater Large,',
])

# iCreate-style blocks: 5 teaching + a labeled Lunch that "Block N" must skip.
BLOCKS = [
    {'start': '09:30', 'end': '10:30', 'label': ''},
    {'start': '10:30', 'end': '11:30', 'label': ''},
    {'start': '11:30', 'end': '12:30', 'label': ''},
    {'start': '12:30', 'end': '13:00', 'label': 'Lunch'},
    {'start': '13:00', 'end': '14:00', 'label': ''},
    {'start': '14:00', 'end': '15:00', 'label': ''},
]

STAFF = [{'id': 'staff-ashley', 'name': 'Ashley Jones'},
         {'id': 'staff-xavier', 'name': 'Xavier Smith'}]

# Flat class-list layout (the actual iCreate master sheet): one row per class,
# combined days, explicit times, extra columns that must not sync.
FLAT_FIXTURE = '\r\n'.join([
    'Class Name,Ages,Class Start Time,Length of Class,Day,Description,Max Capacity,'
    'Year Tuition,Supply Fee,Classroom,Teacher,Image,Category',
    '3D Modeling & Printing,11+,2:00 PM,1 hour,Tuesday,"Design props, structures",'
    '10,365,$35,Teen Large,Xavier,,STEM',
    'Choir,5-9,9:30 AM,1 hour,Tuesday & Thursday,"Sing, together!",12,365,,'
    'Theater Stage,Ashley,,Music',
    'Chef Lab,14+,1:00 PM,2 hours,Tuesday,Cooking skills,10,675,$100,TBD,'
    'Teacher C,,Culinary',
    'Mystery Club,8-12,,1 hour,Tuesday,No start time,12,365,,TBD,TBD,,Academic',
])


@pytest.mark.unit
class TestUrlAndAges:
    def test_edit_link_becomes_export_url(self):
        url = csv_export_url(f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?usp=drivesdk')
        assert url == f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv'

    def test_gid_is_preserved(self):
        url = csv_export_url(f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid=123')
        assert url.endswith('format=csv&gid=123')

    def test_non_google_urls_are_rejected(self):
        for bad in ('https://evil.example.com/spreadsheets/d/x',
                    'http://docs.google.com/spreadsheets/d/x',  # not https
                    'https://docs.google.com.evil.com/spreadsheets/d/x',
                    'file:///etc/passwd', ''):
            with pytest.raises(SheetSyncError):
                csv_export_url(bad)

    def test_age_formats(self):
        assert parse_ages('8-12') == (8, 12)
        assert parse_ages('14+') == (14, None)
        assert parse_ages('all ages') == (None, None)
        assert parse_ages('') == (None, None)
        assert parse_ages('nonsense') == (None, None)


@pytest.mark.unit
class TestParseGrid:
    def test_parses_days_blocks_and_quoted_titles(self):
        entries, warnings = parse_master_grid(FIXTURE)
        # 5 Tuesday cells + 2 Thursday cells (empty cells produce no entries)
        assert len(entries) == 7
        tue_ashley_b1 = next(e for e in entries
                             if e['teacher'] == 'Ashley' and e['day_of_week'] == 2 and e['block'] == 1)
        assert tue_ashley_b1['title'] == 'Peak Play PE'
        assert tue_ashley_b1['ages_raw'] == '8-12'
        assert tue_ashley_b1['room'] == 'Great Hall'
        quoted = next(e for e in entries if 'Power' in e['title'])
        assert quoted['title'] == 'Power, Policy & Profit: US Gov & Econ'
        placeholder = next(e for e in entries if e['title'] == 'Building America')
        assert placeholder['is_placeholder'] is True

    def test_unrecognizable_sheet_raises(self):
        with pytest.raises(SheetSyncError):
            parse_master_grid('just,a,random\ncsv,with,no schedule')


@pytest.mark.unit
class TestParseFlatList:
    def test_dispatcher_picks_the_right_parser(self):
        flat, _ = parse_schedule_csv(FLAT_FIXTURE)
        assert all('start' in e for e in flat)
        grid, _ = parse_schedule_csv(FIXTURE)
        assert all('block' in e for e in grid)

    def test_day_time_and_length_helpers(self):
        assert parse_day_names('Tuesday & Thursday') == [2, 4]
        assert parse_day_names('Mon/Wed') == [1, 3]
        assert parse_day_names('') == []
        assert parse_clock('9:30 AM') == '09:30'
        assert parse_clock('2:00 PM') == '14:00'
        assert parse_clock('12:15 PM') == '12:15'
        assert parse_clock('nope') is None
        assert parse_length_minutes('1 hour') == 60
        assert parse_length_minutes('2 hours') == 120
        assert parse_length_minutes('90 min') == 90
        assert parse_length_minutes('') is None

    def test_combined_days_become_one_entry_per_day(self):
        entries, warnings = parse_schedule_csv(FLAT_FIXTURE)
        choir = [e for e in entries if e['title'] == 'Choir']
        assert [(e['day_of_week'], e['start'], e['end']) for e in choir] == \
            [(2, '09:30', '10:30'), (4, '09:30', '10:30')]
        chef = next(e for e in entries if e['title'] == 'Chef Lab')
        assert (chef['start'], chef['end']) == ('13:00', '15:00')
        assert chef['is_placeholder'] is True  # "Teacher C"
        assert chef['room'] == ''              # "TBD" reads as no room
        # The extra columns produce one info warning.
        assert any('Not synced' in w and 'Year Tuition' in w for w in warnings)
        # Row with no readable start time is skipped with a warning.
        assert not any(e['title'] == 'Mystery Club' for e in entries)
        assert any('Mystery Club' in w for w in warnings)

    def test_flat_entries_need_no_time_blocks(self):
        entries, _ = parse_schedule_csv(FLAT_FIXTURE)
        desired, _ = build_desired_classes(entries, [], STAFF)
        choir = next(d for d in desired if d['name'] == 'Choir')
        assert choir['instructor_id'] == 'staff-ashley'
        assert [(m['day_of_week'], m['start_time'], m['end_time'])
                for m in choir['meetings']] == \
            [(2, '09:30:00', '10:30:00'), (4, '09:30:00', '10:30:00')]


@pytest.mark.unit
class TestDesiredClasses:
    def test_groups_cells_and_skips_lunch_block(self):
        entries, _ = parse_master_grid(FIXTURE)
        desired, warnings = build_desired_classes(entries, BLOCKS, STAFF)
        by_name = {d['name']: d for d in desired}

        # Peak Play PE appears Tue B1 + Thu B1 -> ONE class, two meetings.
        pe = by_name['Peak Play PE']
        assert pe['instructor_id'] == 'staff-ashley'
        assert pe['min_age'] == 8 and pe['max_age'] == 12
        assert [(m['day_of_week'], m['start_time']) for m in pe['meetings']] == \
            [(2, '09:30:00'), (4, '09:30:00')]
        # Rooms differ (Great Hall vs Gym): class keeps the modal room, the
        # odd-one-out is carried on the meeting.
        assert pe['location'] == 'Great Hall'
        assert pe['meetings'][1].get('location') == 'Gym'

        # Same teacher, different title/ages -> separate class.
        assert 'Peak Play Jr PE' in by_name
        assert by_name['Peak Play Jr PE']['min_age'] == 5

        # Placeholder column resolves to no instructor, no warning about it.
        assert by_name['Building America']['instructor_id'] is None

    def test_no_time_blocks_is_a_clear_error(self):
        entries, _ = parse_master_grid(FIXTURE)
        with pytest.raises(SheetSyncError):
            build_desired_classes(entries, [], STAFF)

    def test_teaching_blocks_excludes_breaks(self):
        blocks = teaching_blocks(BLOCKS)
        assert len(blocks) == 5
        assert all('Lunch' not in (b.get('label') or '') for b in blocks)


def _existing_from_desired(desired):
    """Turn desired classes into a matching 'existing' DB state (for idempotency)."""
    existing, meetings = [], {}
    for i, d in enumerate(desired):
        cid = f'class-{i}'
        existing.append({'id': cid, 'name': d['name'], 'location': d['location'],
                         'min_age': d['min_age'], 'max_age': d['max_age'],
                         'primary_instructor_id': d['instructor_id']})
        meetings[cid] = [dict(m) for m in d['meetings']]
    return existing, meetings


@pytest.mark.unit
class TestDiff:
    def _desired(self):
        entries, _ = parse_master_grid(FIXTURE)
        desired, _ = build_desired_classes(entries, BLOCKS, STAFF)
        return desired

    def test_empty_org_proposes_only_creates(self):
        desired = self._desired()
        result = build_operations(desired, [], {}, STAFF)
        assert {op['action'] for op in result['operations']} == {'create_class'}
        assert len(result['operations']) == len(desired)
        assert all(op['default_selected'] for op in result['operations'])

    def test_sync_is_idempotent(self):
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        result = build_operations(desired, existing, meetings, STAFF)
        assert result['operations'] == []
        assert 'already match' in result['summary']

    def test_field_and_schedule_changes_are_detected(self):
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        pe = next(e for e in existing if e['name'] == 'Peak Play PE')
        pe['max_age'] = 10                      # sheet says 12
        meetings[pe['id']] = meetings[pe['id']][:1]  # sheet has 2 meetings

        result = build_operations(desired, existing, meetings, STAFF)
        by_action = {op['action']: op for op in result['operations']}
        assert by_action['update_class']['class_id'] == pe['id']
        assert by_action['update_class']['fields'] == {'max_age': 12}
        assert by_action['set_meetings']['class_id'] == pe['id']
        assert len(by_action['set_meetings']['meetings']) == 2

    def test_class_missing_from_sheet_is_an_unchecked_archive(self):
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        existing.append({'id': 'stale', 'name': 'Retired Pottery',
                         'primary_instructor_id': None,
                         'location': None, 'min_age': None, 'max_age': None})

        result = build_operations(desired, existing, meetings, STAFF)
        archives = [op for op in result['operations'] if op['action'] == 'archive_class']
        assert len(archives) == 1
        assert archives[0]['class_id'] == 'stale'
        assert archives[0]['default_selected'] is False

    def test_meeting_room_on_meeting_vs_class_is_not_a_reschedule(self):
        # Existing data often stores the room on each meeting while the sheet
        # puts it on the class — that must not read as a schedule change.
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        jr = next(e for e in existing if e['name'] == 'Peak Play Jr PE')
        for m in meetings[jr['id']]:
            m['location'] = jr['location']  # explicit room == class room

        result = build_operations(desired, existing, meetings, STAFF)
        assert not any(op['action'] == 'set_meetings' and op['class_id'] == jr['id']
                       for op in result['operations'])

    def test_per_day_named_class_keeps_its_name(self):
        # Sheet "Peak Play Jr PE" (Tuesday) <-> Optio "Peak Play Jr PE (Tuesday)":
        # the suffix matches the sheet's day, so it pairs as that day's slice and
        # the school's per-day naming convention is preserved — no rename, and
        # nothing else differs, so no operations at all.
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        jr = next(e for e in existing if e['name'] == 'Peak Play Jr PE')
        jr['name'] = 'Peak Play Jr PE (Tuesday)'

        result = build_operations(desired, existing, meetings, STAFF)
        assert result['operations'] == []

    def test_wrong_day_suffix_pairs_as_rename(self):
        # Sheet has the class on Tuesday but Optio calls it "(Thursday)" — not a
        # clean day partition, so it falls back to the 1<->1 rename pairing.
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        jr = next(e for e in existing if e['name'] == 'Peak Play Jr PE')
        jr['name'] = 'Peak Play Jr PE (Thursday)'

        result = build_operations(desired, existing, meetings, STAFF)
        actions = {op['action'] for op in result['operations']}
        assert 'create_class' not in actions and 'archive_class' not in actions
        rename = next(op for op in result['operations'] if op['action'] == 'update_class')
        assert rename['fields']['name'] == 'Peak Play Jr PE'
        assert 'fuzzy match' in rename['label']

    def test_per_day_split_classes_pair_with_day_slices(self):
        # Sheet "Peak Play PE" (Tue + Thu) vs Optio "Peak Play PE (Tuesday)" +
        # "Peak Play PE (Thursday)": the suffix days partition the sheet days,
        # so each split class pairs with its day's slice — no renames, no
        # creates, no archives, no enrollments moved.
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        pe = next(e for e in existing if e['name'] == 'Peak Play PE')
        pe['name'] = 'Peak Play PE (Tuesday)'
        meetings[pe['id']] = meetings[pe['id']][:1]  # its Tuesday meeting
        existing.append({'id': 'thu', 'name': 'Peak Play PE (Thursday)',
                         'primary_instructor_id': 'staff-ashley',
                         'location': 'Gym', 'min_age': 8, 'max_age': 12})
        meetings['thu'] = [{'day_of_week': 4, 'start_time': '09:30:00',
                            'end_time': '10:30:00'}]

        result = build_operations(desired, existing, meetings, STAFF)
        assert result['operations'] == []  # both sides already agree, per day
        assert not any('reconcile manually' in w for w in result['warnings'])

    def test_day_split_pairing_detects_per_day_changes(self):
        # Same split, but the Thursday class's meeting time is stale.
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        pe = next(e for e in existing if e['name'] == 'Peak Play PE')
        pe['name'] = 'Peak Play PE (Tuesday)'
        meetings[pe['id']] = meetings[pe['id']][:1]
        existing.append({'id': 'thu', 'name': 'Peak Play PE (Thursday)',
                         'primary_instructor_id': 'staff-ashley',
                         'location': 'Gym', 'min_age': 8, 'max_age': 12})
        meetings['thu'] = [{'day_of_week': 4, 'start_time': '13:00:00',
                            'end_time': '14:00:00'}]  # sheet says 09:30

        result = build_operations(desired, existing, meetings, STAFF)
        sched = [op for op in result['operations'] if op['action'] == 'set_meetings']
        assert [op['class_id'] for op in sched] == ['thu']
        assert sched[0]['meetings'] == [{'day_of_week': 4, 'start_time': '09:30:00',
                                         'end_time': '10:30:00'}]
        # No renames proposed — the per-day names are kept.
        assert not any(op['action'] == 'update_class' and 'name' in op['fields']
                       for op in result['operations'])

    def test_same_name_sections_pair_by_days_when_teacher_changes(self):
        # Two "Brain Games" sections (Tue 5-7, Thu 8-11). The Tuesday section's
        # teacher changed in the sheet, breaking the exact match — the
        # name+ages+days key must still pair them 1:1 and propose the teacher
        # change instead of warning "reconcile manually".
        desired = [
            {'name': 'Brain Games', 'teacher': 'Ashley', 'instructor_id': 'staff-ashley',
             'min_age': 5, 'max_age': 7, 'location': None,
             'meetings': [{'day_of_week': 2, 'start_time': '10:30:00', 'end_time': '11:30:00'}]},
            {'name': 'Brain Games', 'teacher': 'Xavier', 'instructor_id': 'staff-xavier',
             'min_age': 8, 'max_age': 11, 'location': None,
             'meetings': [{'day_of_week': 4, 'start_time': '10:30:00', 'end_time': '11:30:00'}]},
        ]
        existing = [
            {'id': 'tue', 'name': 'Brain Games', 'primary_instructor_id': 'staff-xavier',
             'location': None, 'min_age': 5, 'max_age': 7},
            {'id': 'thu', 'name': 'Brain Games', 'primary_instructor_id': 'staff-xavier',
             'location': None, 'min_age': 8, 'max_age': 11},
        ]
        meetings = {'tue': [{'day_of_week': 2, 'start_time': '10:30:00', 'end_time': '11:30:00'}],
                    'thu': [{'day_of_week': 4, 'start_time': '10:30:00', 'end_time': '11:30:00'}]}

        result = build_operations(desired, existing, meetings, STAFF)
        assert not result['warnings']
        updates = [op for op in result['operations'] if op['action'] == 'update_class']
        assert [(op['class_id'], op['fields']) for op in updates] == \
            [('tue', {'primary_instructor_id': 'staff-ashley'})]

    def test_two_day_pair_groups_split_cleanly(self):
        # Sheet: "Kinder Nature School" Mon/Wed and Tue/Thu rows (different
        # teachers); Optio: "(Mon/Wed)" and "(Tue/Thu)" split classes. Each
        # candidate belongs to one sheet class — the other pair's class must
        # be skipped, not abort the partition.
        base = {'name': 'Kinder Nature School', 'min_age': 5, 'max_age': 6, 'location': None}
        desired = [
            {**base, 'teacher': 'Ashley', 'instructor_id': 'staff-ashley',
             'meetings': [{'day_of_week': 1, 'start_time': '09:30:00', 'end_time': '12:30:00'},
                          {'day_of_week': 3, 'start_time': '09:30:00', 'end_time': '12:30:00'}]},
            {**base, 'teacher': 'Xavier', 'instructor_id': 'staff-xavier',
             'meetings': [{'day_of_week': 2, 'start_time': '09:30:00', 'end_time': '12:30:00'},
                          {'day_of_week': 4, 'start_time': '09:30:00', 'end_time': '12:30:00'}]},
        ]
        existing = [
            {'id': 'mw', 'name': 'Kinder Nature School (Mon/Wed)',
             'primary_instructor_id': 'staff-ashley', 'location': None, 'min_age': 5, 'max_age': 6},
            {'id': 'tt', 'name': 'Kinder Nature School (Tue/Thu)',
             'primary_instructor_id': 'staff-xavier', 'location': None, 'min_age': 5, 'max_age': 6},
        ]
        meetings = {'mw': [{'day_of_week': 1, 'start_time': '09:30:00', 'end_time': '12:30:00'},
                           {'day_of_week': 3, 'start_time': '09:30:00', 'end_time': '12:30:00'}],
                    'tt': [{'day_of_week': 2, 'start_time': '09:30:00', 'end_time': '12:30:00'},
                           {'day_of_week': 4, 'start_time': '09:30:00', 'end_time': '12:30:00'}]}

        result = build_operations(desired, existing, meetings, STAFF)
        assert result['operations'] == []
        assert not result['warnings']

    def test_day_split_without_clean_partition_is_left_alone(self):
        # Ages differ (ages are identity), so the split pairing must not fire;
        # the count guard leaves both sides untouched with a warning.
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        pe = next(e for e in existing if e['name'] == 'Peak Play PE')
        pe['name'] = 'Peak Play PE (Tuesday)'
        pe['max_age'] = 14  # sheet says 12
        existing.append({'id': 'thu', 'name': 'Peak Play PE (Thursday)',
                         'primary_instructor_id': 'staff-ashley',
                         'location': 'Gym', 'min_age': 8, 'max_age': 14})

        result = build_operations(desired, existing, meetings, STAFF)
        assert not any(op['action'] == 'create_class' and 'Peak Play PE' in op['fields'].get('name', '')
                       for op in result['operations'])
        assert not any(op['action'] == 'archive_class' and op['class_id'] in (pe['id'], 'thu')
                       for op in result['operations'])
        assert any('reconcile manually' in w for w in result['warnings'])

    def test_same_name_count_mismatch_suppresses_arbitrary_matches(self):
        # One "Reading Tutoring" in the sheet vs several identically-named
        # classes in Optio: an exact match between them is arbitrary, and the
        # unmatched siblings must not become archives or reschedules.
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        pe = next(e for e in existing if e['name'] == 'Peak Play PE')
        twin = {**pe, 'id': 'twin'}
        existing.append(twin)
        meetings['twin'] = [meetings[pe['id']][0]]

        result = build_operations(desired, existing, meetings, STAFF)
        touched = {op.get('class_id') for op in result['operations']}
        assert pe['id'] not in touched and 'twin' not in touched
        assert not any(op['action'] == 'create_class' and op['fields']['name'] == 'Peak Play PE'
                       for op in result['operations'])
        assert any('reconcile manually' in w for w in result['warnings'])

    def test_archive_labels_show_enrollment_counts(self):
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        existing.append({'id': 'stale', 'name': 'Retired Pottery',
                         'primary_instructor_id': None,
                         'location': None, 'min_age': None, 'max_age': None})
        result = build_operations(desired, existing, meetings, STAFF,
                                  enrollment_counts={'stale': 7})
        archive = next(op for op in result['operations'] if op['action'] == 'archive_class')
        assert '7 enrolled' in archive['label']

    def test_ai_pairs_become_reviewed_renames_not_create_plus_archive(self):
        desired = self._desired()
        existing, meetings = _existing_from_desired(desired)
        pe = next(e for e in existing if e['name'] == 'Peak Play PE')
        pe['name'] = 'Peak Play P.E. (old name)'  # exact matching now fails

        # Without AI pairing: a create + an archive.
        blind = build_operations(desired, existing, meetings, STAFF)
        assert {op['action'] for op in blind['operations']} >= {'create_class', 'archive_class'}

        # With the AI pairing the leftovers: a labeled rename instead.
        d_pe = next(d for d in desired if d['name'] == 'Peak Play PE')
        result = build_operations(desired, existing, meetings, STAFF, ai_pairs=[(d_pe, pe)])
        actions = {op['action'] for op in result['operations']}
        assert 'create_class' not in actions and 'archive_class' not in actions
        rename = next(op for op in result['operations'] if op['action'] == 'update_class')
        assert rename['fields']['name'] == 'Peak Play PE'
        assert 'fuzzy match' in rename['label']
