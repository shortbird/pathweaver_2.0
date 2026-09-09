/**
 * A child's week, on paper, from the phone.
 *
 * iCreate campus coordinator, 2026-08-31: "Would be nice if we could print the
 * schedule." The web app has printed a schedule since 2026-08-22
 * (/family/students/:id/schedule), but iCreate's families are in the app, and
 * a parent who wants the week on the fridge is not going to open a browser and
 * sign in again to get it.
 *
 * Rendered as HTML and handed to the OS print sheet (expo-print), which is
 * where both outcomes live: AirPrint to a printer, or the share icon to save a
 * PDF into Files. That is why the button says "Print or save as PDF" — those
 * read as two features to a parent, and the sheet does both.
 *
 * Laid out day by day rather than class by class, matching what the app shows
 * and answering the question families actually take to the fridge: where is she
 * at 10:30 on Tuesday? A class with no meetings recorded still gets a line
 * under "Not scheduled yet" — the sheet a family takes home must not silently
 * drop a class they are paying for.
 */
import * as Print from 'expo-print';
import {
  meetingsByDay, meetingTime,
  type ScheduledClass,
} from '@/src/hooks/useClassSchedule';

/** Class names and room labels are school-entered text, not markup. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The printable sheet. Pure — takes the classes and returns HTML — so what
 * lands on paper can be asserted in a test instead of eyeballed on a phone.
 */
export function scheduleHtml(
  studentName: string,
  classes: ScheduledClass[],
  { printedOn = new Date() }: { printedOn?: Date } = {},
): string {
  const days = meetingsByDay(classes);
  const printed = printedOn.toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const dayBlocks = days.map((day) => {
    const rows = day.rows.map(({ cls, meeting }) => {
      // The meeting's own room wins over the class default, exactly as the
      // on-screen rows resolve it — a class that moves rooms one day must not
      // send a family to the wrong door on the printout either.
      const room = meeting?.location || cls.location;
      const time = meeting ? meetingTime(meeting) : '';
      const details = [cls.teacher_name, room].filter(Boolean)
        .map((x) => escapeHtml(x)).join(' &middot; ');
      return `
        <tr>
          <td class="time">${escapeHtml(time) || '&mdash;'}</td>
          <td>
            <div class="name">${escapeHtml(cls.name)}</div>
            ${details ? `<div class="details">${details}</div>` : ''}
          </td>
        </tr>`;
    }).join('');
    return `
      <section>
        <h2>${escapeHtml(day.label)}</h2>
        <table>${rows}</table>
      </section>`;
  }).join('');

  const empty = '<p class="empty">No classes are scheduled yet.</p>';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(studentName)} — Class schedule</title>
    <style>
      /* Black on white and system fonts: this is going to a printer, which
         has neither the app's palette nor its fonts. */
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #000; margin: 0; padding: 28px 24px;
      }
      header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 18px; }
      h1 { font-size: 20px; margin: 0; }
      .sub { font-size: 12px; color: #444; margin-top: 4px; }
      section { margin-bottom: 18px; page-break-inside: avoid; }
      h2 {
        font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em;
        margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid #999;
      }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 6px 0; vertical-align: top; border-bottom: 1px solid #e5e5e5; }
      td.time { width: 40%; padding-right: 12px; font-size: 12px; white-space: nowrap; }
      .name { font-size: 14px; font-weight: 600; }
      .details { font-size: 12px; color: #444; margin-top: 2px; }
      .empty { font-size: 13px; color: #444; }
      footer { margin-top: 22px; font-size: 11px; color: #666; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(studentName)}</h1>
      <div class="sub">Class schedule</div>
    </header>
    ${days.length ? dayBlocks : empty}
    <footer>Printed ${escapeHtml(printed)} from Optio</footer>
  </body>
</html>`;
}

/**
 * Hand the sheet to the OS print dialog. Resolves when the dialog closes;
 * a parent who backs out of it has not failed at anything, so cancellation is
 * not an error the caller should shout about.
 */
export async function printSchedule(
  studentName: string,
  classes: ScheduledClass[],
): Promise<void> {
  await Print.printAsync({ html: scheduleHtml(studentName, classes) });
}
