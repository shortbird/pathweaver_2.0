/**
 * When the safety screen holds a message, the backend answers 400 with one
 * sentence for the author ("That was held by our safety check..."). Both
 * chat windows must put that sentence on screen: until 2026-09-15 the direct
 * message window swallowed every send error and the group window only spoke
 * on a 403, so a held message simply vanished and the child typed it again.
 *
 * A source check rather than a render: the windows pull in realtime, upload
 * and keyboard hooks that a unit render would have to stub one by one.
 */

import fs from 'fs';
import path from 'path';

const here = path.resolve(__dirname, '..');

function sendCatchBlock(file: string, sendCall: string): string {
  const src = fs.readFileSync(path.join(here, file), 'utf8');
  const at = src.indexOf(sendCall);
  expect(at).toBeGreaterThan(-1);
  const catchAt = src.indexOf('catch', at);
  const finallyAt = src.indexOf('finally', catchAt);
  return src.slice(catchAt, finallyAt);
}

describe('a held message reaches the child', () => {
  it('the direct message window shows the server sentence on a failed send', () => {
    const block = sendCatchBlock('ChatWindow.tsx', 'await sendDirectMessage(');
    expect(block).toContain('toast.error(e?.response?.data?.error');
  });

  it('the group chat window shows the server sentence on every failed send, not only a 403', () => {
    const block = sendCatchBlock('GroupChatWindow.tsx', 'await sendGroupMessage(');
    const toasts = block.split('toast.error(').length - 1;
    expect(toasts).toBeGreaterThanOrEqual(2);
    expect(block).toContain("} else {");
  });
});

describe('a class chat message can be reported', () => {
  it('the group window offers Report on another person\'s message and files it as group_message', () => {
    const src = fs.readFileSync(path.join(here, 'GroupChatWindow.tsx'), 'utf8');
    expect(src).toContain("reportContent('group_message'");
    expect(src).toContain('onReport={() => actionsFor && setReportingMsg(actionsFor)}');
    // The reason sheet renders beside every copy of the actions sheet.
    expect(src.split('{reportSheet}').length - 1).toBe(src.split('{actionsSheet}').length - 1);
  });
});
