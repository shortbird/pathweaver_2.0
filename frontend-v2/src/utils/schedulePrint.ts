/**
 * Printing a class schedule.
 *
 * iCreate's campus coordinator asked for it (2026-08-31): the schedule is the
 * thing a family tapes to the fridge, and a phone screen is not that. Both the
 * school hub and the family tab hand their already-grouped week to
 * `printSchedule`, so what comes out of the printer is laid out the same way
 * the screen is — day headings, in time order, room included.
 *
 * expo-print's `printAsync` opens the OS print sheet on iOS/Android (AirPrint,
 * "Save to Files", "Save as PDF") and the browser's print dialog on web, so
 * "print" and "save a PDF" are the same action and neither needs a share
 * dependency the app doesn't already carry.
 */
import { meetingsByDay, meetingTime, type ScheduledClass } from '@/src/hooks/useClassSchedule';

/** Escape anything that lands in the printed HTML. Class names, teacher names
 *  and room labels are school-entered text, not ours. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The printable page for one student's week. Exported for tests — the HTML is
 *  the whole output, so it is the thing worth asserting on. */
export function scheduleHtml(
  studentName: string,
  classes: ScheduledClass[],
  schoolName?: string | null,
): string {
  const days = meetingsByDay(classes);
  const rows = days
    .map((day) => {
      const items = day.rows
        .map(({ cls, meeting }) => {
          const room = meeting?.location || cls.location;
          const time = meeting ? meetingTime(meeting) : '';
          return `<tr>
            <td class="time">${esc(time || 'Time not posted')}</td>
            <td class="name">${esc(cls.name)}</td>
            <td class="who">${esc(cls.teacher_name || '')}</td>
            <td class="room">${esc(room || '')}</td>
          </tr>`;
        })
        .join('');
      return `<tr class="day"><td colspan="4">${esc(day.label)}</td></tr>${items}`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { margin: 16mm; }
  body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a2e; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { font-size: 12px; color: #6b6b80; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 7px 8px; font-size: 12px; border-bottom: 1px solid #e8e8f0; vertical-align: top; }
  tr.day td { background: #f4f0fb; color: #6d469b; font-weight: 700; text-transform: uppercase;
              letter-spacing: .04em; font-size: 11px; border-bottom: none; padding-top: 12px; }
  td.time { white-space: nowrap; color: #4a4a5e; width: 30%; }
  td.name { font-weight: 600; }
  td.who, td.room { color: #6b6b80; white-space: nowrap; }
  .empty { font-size: 13px; color: #6b6b80; }
</style></head>
<body>
  <h1>${esc(studentName)}</h1>
  <p class="sub">Class schedule${schoolName ? ` · ${esc(schoolName)}` : ''}</p>
  ${rows ? `<table>${rows}</table>` : '<p class="empty">No classes scheduled yet.</p>'}
</body></html>`;
}

/** Open the OS print sheet for one student's week. Resolves false when the
 *  sheet could not be opened (or the user cancelled), so a caller can say so
 *  rather than leaving a dead button. */
export async function printSchedule(
  studentName: string,
  classes: ScheduledClass[],
  schoolName?: string | null,
): Promise<boolean> {
  try {
    // Required lazily: expo-print pulls in a native module, and the schedule
    // renders on every school-page visit whether or not anyone prints.
    const Print = require('expo-print');
    await Print.printAsync({ html: scheduleHtml(studentName, classes, schoolName) });
    return true;
  } catch {
    return false;
  }
}
