/**
 * The rows of a student's transcript, built once for every screen that shows
 * it: the office editor (TranscriptGeneratorPage), the shared public page
 * (PublicTranscriptPage) and the school-admin card on the student overview
 * (TranscriptSection). Each used to build its own copy, which is how a rule
 * lands on one screen and not the others.
 *
 * Course names and credit (ticket 9200a103 item 4, then Tanner 2026-10-15,
 * for every student): Optio credit prints the way a school records it.
 *
 *  - Optio credit for a subject is the student's earned subject credit plus
 *    the credit of the classes they were awarded in that subject.
 *  - It prints in quarter credits, rounded down, so a subject appears only
 *    once it reaches 0.25 and then grows a quarter at a time. The student
 *    keeps every bit they earned; only the printed figure waits.
 *  - It prints as numbered courses named for the subject: "Language Arts 1",
 *    "Language Arts 2". Each course is one credit, except that a subject
 *    requiring less than a whole credit, or ending on a half (Fine Arts at
 *    1.5), ends its requirement with a half-credit course. Past the
 *    requirement the courses are whole credits again.
 *  - A course not yet full prints with its credit so far, as In Progress.
 *  - Transfer credit prints as the other school recorded it, unrounded and
 *    under its own names, and Optio's numbering continues from it.
 *  - A name the office set still wins: a breakdown into named courses
 *    (overrides[`optio_courses_<subject>`] = [{ name, credits }]) or a name
 *    typed on the earned or class row. Named credit prints first, rounded
 *    down to a quarter like the rest, and the remainder is numbered from
 *    where it leaves off.
 */

import { CREDIT_REQUIREMENTS } from '@shared/credits';

export const optioCoursesKey = (subject) => `optio_courses_${subject}`;

// Credit is counted in whole quarters so the arithmetic is exact.
const toQuarters = (credits) => Math.floor((Number(credits) || 0) * 4 + 1e-6);
const fromQuarters = (q) => q / 4;

function fieldFrom(overrides) {
  return (key, fallback) => (
    overrides?.[key] !== undefined && overrides[key] !== '' ? overrides[key] : fallback
  );
}

/** The saved breakdown for a subject, cleaned of blank or zero rows. */
export function optioBreakdown(overrides, subject) {
  const raw = overrides?.[optioCoursesKey(subject)];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => ({ name: String(c?.name || '').trim(), credits: Number(c?.credits) || 0 }))
    .filter((c) => c.name && c.credits > 0);
}

/**
 * The size, in quarters, of the subject's nth course (0-based): whole credits
 * up to the requirement, a final half where the requirement ends on one, then
 * whole credits again.
 */
function courseQuarters(subject, n) {
  const required = toQuarters(CREDIT_REQUIREMENTS[subject]?.credits || 0);
  const whole = Math.floor(required / 4);
  if (n < whole) return 4;
  if (n === whole && required % 4) return required % 4;
  return 4;
}

function transferCreditBySubject(transferCredits) {
  const bySubject = {};
  (transferCredits || []).forEach((tc) => {
    Object.entries(tc.subjects || {}).forEach(([subject, info]) => {
      bySubject[subject] = (bySubject[subject] || 0) + (Number(info?.credits) || 0);
    });
  });
  return bySubject;
}

function optioRows(earnedCredits, classCredits, transferCredits, overrides) {
  const field = fieldFrom(overrides);
  const transferred = transferCreditBySubject(transferCredits);
  const bySubject = {};
  const entry = (subject, displayName) => {
    if (!bySubject[subject]) bySubject[subject] = { displayName, earned: 0, classes: [] };
    return bySubject[subject];
  };
  Object.entries(earnedCredits || {}).forEach(([subject, info]) => {
    if (info.credits > 0) entry(subject, info.display_name).earned = info.credits;
  });
  (classCredits || []).forEach((cc) => {
    entry(cc.school_subject, cc.display_name).classes.push(cc);
  });

  const rows = [];
  Object.entries(bySubject).forEach(([subject, s]) => {
    const classTotal = s.classes.reduce((sum, c) => sum + c.credits, 0);
    const total = toQuarters(s.earned + classTotal);
    if (total === 0) return;
    const base = {
      subject: s.displayName,
      subjectKey: subject,
      source: 'Optio',
      totalSubjectCredits: fromQuarters(total),
    };

    // Named credit first, never more than the subject holds.
    let left = total;
    const take = (credits) => {
      const q = Math.min(toQuarters(credits), left);
      left -= q;
      return q;
    };
    const courses = optioBreakdown(overrides, subject);
    if (courses.length > 0) {
      courses.forEach((course) => {
        const q = take(course.credits);
        if (q > 0) {
          rows.push({ ...base, type: 'optio', status: 'Completed', course: course.name, credits: fromQuarters(q), hasCourseBreakdown: true });
        }
      });
    } else {
      const named = [
        { type: 'earned', key: `earned_course_${subject}`, credits: s.earned },
        { type: 'class', key: `class_courses_${subject}`, credits: classTotal },
      ];
      named.forEach(({ type, key, credits }) => {
        const name = field(key, null);
        if (!name || credits <= 0) return;
        const q = take(credits);
        if (q > 0) {
          rows.push({ ...base, type, status: 'Completed', course: name, courseOverrideKey: key, credits: fromQuarters(q) });
        }
      });
    }

    // The rest is numbered, picking up where the credit printed ahead of it
    // (transfer, then named) leaves off: a course that credit only part
    // filled is finished first, under its number.
    const ahead = toQuarters(transferred[subject] || 0) + (total - left);
    let n = 0;
    let edge = 0;
    while (edge + courseQuarters(subject, n) <= ahead) {
      edge += courseQuarters(subject, n);
      n += 1;
    }
    let filled = ahead - edge;
    while (left > 0) {
      const room = courseQuarters(subject, n) - filled;
      const q = Math.min(room, left);
      left -= q;
      rows.push({
        ...base,
        type: 'optio',
        status: q === room ? 'Completed' : 'In Progress',
        course: `${s.displayName} ${n + 1}`,
        credits: fromQuarters(q),
        numbered: true,
      });
      n += 1;
      filled = 0;
    }
  });
  return rows;
}

function transferRows(transferCredits, overrides) {
  const field = fieldFrom(overrides);
  const rows = [];
  (transferCredits || []).forEach((tc) => {
    const courseNames = tc.course_names || {};
    Object.entries(tc.subjects || {}).forEach(([subject, info]) => {
      const courses = courseNames[subject];
      if (courses && courses.length > 0) {
        courses.forEach((course, idx) => {
          const overrideKey = `tc_course_${tc.id}_${subject}_${idx}`;
          rows.push({
            type: 'transfer',
            subject: info.display_name,
            course: field(overrideKey, course.name),
            courseOverrideKey: overrideKey,
            source: tc.school_name || 'Transfer',
            credits: course.credits,
            grade: course.grade || 'A',
            status: 'Completed',
            transcriptUrl: idx === 0 ? tc.transcript_url : null,
            transferCreditId: tc.id,
            subjectKey: subject,
            hasCourseBreakdown: true,
          });
        });
      } else {
        const overrideKey = `tc_course_${tc.id}_${subject}`;
        rows.push({
          type: 'transfer',
          subject: info.display_name,
          course: field(overrideKey, info.display_name),
          courseOverrideKey: overrideKey,
          source: tc.school_name || 'Transfer',
          credits: info.credits,
          status: 'Completed',
          transcriptUrl: tc.transcript_url,
          transferCreditId: tc.id,
          subjectKey: subject,
          totalSubjectCredits: info.credits,
        });
      }
    });
  });
  return rows;
}

function plannedRows(plannedCredits) {
  return (plannedCredits || []).map((pc) => ({
    type: 'planned',
    subject: pc.display_name,
    course: pc.course_name,
    source: pc.source || '',
    credits: pc.credits,
    status: pc.status === 'in_progress' ? 'In Progress' : pc.status === 'completed' ? 'Completed' : 'Dropped',
    id: pc.id,
    raw: pc,
  }));
}

/**
 * @param {object} data - the transcript payload (earned_credits, class_credits,
 *   transfer_credits, planned_credits)
 * @param {object} overrides - the office's saved transcript overrides
 * @param {{ includePlanned?: boolean }} options - planned credit appears only
 *   in the office editor; no planned credit is on an official transcript
 *   (ticket 9200a103, item 1)
 */
export function buildTranscriptRows(data, overrides, { includePlanned = false } = {}) {
  // Transfer credit comes before Optio's within a subject, because Optio's
  // numbering continues from it. The sort is stable, so each subject keeps
  // that order and its courses stay in number order, In Progress included.
  // Planned credit, which never prints, goes last.
  const rows = [
    ...transferRows(data?.transfer_credits, overrides),
    ...optioRows(data?.earned_credits, data?.class_credits, data?.transfer_credits, overrides),
    ...(includePlanned ? plannedRows(data?.planned_credits) : []),
  ];
  rows.sort((a, b) => {
    const planned = (a.type === 'planned') - (b.type === 'planned');
    return planned || a.subject.localeCompare(b.subject);
  });
  return rows;
}
