/**
 * The rows of a student's transcript, built once for every screen that shows
 * it: the office editor (TranscriptGeneratorPage), the shared public page
 * (PublicTranscriptPage) and the school-admin card on the student overview
 * (TranscriptSection). Each used to build its own copy, which is how a rule
 * lands on one screen and not the others.
 *
 * Course names (ticket 9200a103, item 4, settled with Tanner 2026-09-22 and
 * 2026-10-13): the transcript prints conventional course names, never quest
 * or class titles, and Optio's office sets every one.
 *
 *  - Optio credit for a subject is the student's earned subject credit plus
 *    the credit of the classes they were awarded in that subject.
 *  - Unnamed, it prints under the subject's own name ("Mathematics"). This
 *    replaced "Optio Competency-Based" and, for classes, the joined class
 *    titles. A name the office already typed on that row still wins.
 *  - The office can break a subject's Optio credit into named courses
 *    (overrides[`optio_courses_<subject>`] = [{ name, credits }]), the same
 *    breakdown transfer credit has had. The courses replace the earned and
 *    class rows for that subject.
 *  - Credit the named courses do not hold prints as one more row under the
 *    subject's name, because it is earned and the totals must add up. Earned
 *    credit keeps growing after the office names courses, so this is normal.
 *    If credit ever falls below what the courses claim, the later courses
 *    are cut down so the transcript never prints more than was earned.
 */

export const optioCoursesKey = (subject) => `optio_courses_${subject}`;

const EPSILON = 0.005;

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

function optioRows(earnedCredits, classCredits, overrides) {
  const field = fieldFrom(overrides);
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
    const total = s.earned + classTotal;
    const base = {
      subject: s.displayName,
      subjectKey: subject,
      source: 'Optio',
      status: 'Completed',
      totalSubjectCredits: total,
    };

    const courses = optioBreakdown(overrides, subject);
    if (courses.length > 0) {
      let left = total;
      courses.forEach((course) => {
        const credits = Math.min(course.credits, Math.max(left, 0));
        left -= credits;
        if (credits > EPSILON) {
          rows.push({ ...base, type: 'optio', course: course.name, credits, hasCourseBreakdown: true });
        }
      });
      if (left > EPSILON) {
        rows.push({ ...base, type: 'optio', course: s.displayName, credits: left, hasCourseBreakdown: true, unassigned: true });
      }
      return;
    }

    if (s.earned > 0) {
      const key = `earned_course_${subject}`;
      rows.push({ ...base, type: 'earned', course: field(key, s.displayName), courseOverrideKey: key, credits: s.earned });
    }
    if (classTotal > 0) {
      const key = `class_courses_${subject}`;
      rows.push({ ...base, type: 'class', course: field(key, s.displayName), courseOverrideKey: key, credits: classTotal });
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
  const rows = [
    ...optioRows(data?.earned_credits, data?.class_credits, overrides),
    ...transferRows(data?.transfer_credits, overrides),
    ...(includePlanned ? plannedRows(data?.planned_credits) : []),
  ];
  rows.sort((a, b) => {
    if (a.status === 'Completed' && b.status !== 'Completed') return -1;
    if (a.status !== 'Completed' && b.status === 'Completed') return 1;
    return a.subject.localeCompare(b.subject);
  });
  return rows;
}
