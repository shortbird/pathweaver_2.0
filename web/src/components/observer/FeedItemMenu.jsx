import { useState } from 'react';
import PropTypes from 'prop-types';
import { toast } from 'react-hot-toast';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import * as friends from '../../services/friendsAPI';
import { useConfirm } from '../../contexts/ConfirmContext';

/**
 * FeedItemMenu — report a feed item, block its author, or (for a friend)
 * remove the friendship. The web had no report or block UI at all until
 * 2026-09-16; the app has carried one since the App Store review that
 * required it (Guideline 1.2). Same reasons, same endpoints.
 *
 * Block beats every other grant: a blocked student stops seeing the
 * blocker, past comments included, with no parent asked to unwind anything.
 */

const REASONS = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam' },
  { value: 'self_harm', label: 'Self-harm' },
  { value: 'other', label: 'Other' },
];

export default function FeedItemMenu({ targetType, targetId, studentId, studentName, isFriend, onHidden }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState('root');
  const [busy, setBusy] = useState(false);
  // Not window.confirm: it silently answers false inside iOS in-app browsers.
  const confirm = useConfirm();

  const close = () => { setOpen(false); setStage('root'); };

  const report = async (reason) => {
    setBusy(true);
    try {
      await api.post('/api/moderation/report', { target_type: targetType, target_id: targetId, reason });
      toast.success('Thanks. We received your report and will review it.');
      close();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not submit that report.');
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    if (!studentId) return;
    if (!(await confirm({
      title: `Block ${studentName}?`,
      body: "You will no longer see each other's posts. They will not be notified.",
      confirmLabel: 'Block',
      destructive: true,
    }))) return;
    setBusy(true);
    try {
      await api.post('/api/moderation/block', { blocked_id: studentId });
      onHidden?.();
      close();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not block this user.');
    } finally {
      setBusy(false);
    }
  };

  const removeFriend = async () => {
    if (!studentId) return;
    if (!(await confirm({
      title: `Remove ${studentName} as a friend?`,
      body: "You will no longer see each other's work. They will not be told.",
      confirmLabel: 'Remove',
      destructive: true,
    }))) return;
    setBusy(true);
    try {
      const list = await friends.getConnections();
      const conn = (list.active || []).find((x) => x.peer?.id === studentId);
      if (conn) await friends.revoke(conn.id);
      onHidden?.();
      close();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove this friend.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
      >
        <EllipsisHorizontalIcon className="w-5 h-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg z-20 py-1 text-sm">
          {stage === 'root' && (
            <>
              <button role="menuitem" type="button" onClick={() => setStage('reason')} className="w-full text-left px-4 py-2 hover:bg-gray-50">
                Report this post
              </button>
              {studentId && isFriend && (
                <button role="menuitem" type="button" onClick={removeFriend} disabled={busy} className="w-full text-left px-4 py-2 hover:bg-gray-50">
                  Remove {studentName} as a friend
                </button>
              )}
              {studentId && (
                <button role="menuitem" type="button" onClick={block} disabled={busy} className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50">
                  Block {studentName}
                </button>
              )}
              <button role="menuitem" type="button" onClick={close} className="w-full text-left px-4 py-2 text-gray-500 hover:bg-gray-50">
                Cancel
              </button>
            </>
          )}
          {stage === 'reason' && (
            <>
              <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Why are you reporting this?</p>
              {REASONS.map((r) => (
                <button key={r.value} role="menuitem" type="button" onClick={() => report(r.value)} disabled={busy} className="w-full text-left px-4 py-2 hover:bg-gray-50">
                  {r.label}
                </button>
              ))}
              <button role="menuitem" type="button" onClick={close} className="w-full text-left px-4 py-2 text-gray-500 hover:bg-gray-50">
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

FeedItemMenu.propTypes = {
  targetType: PropTypes.oneOf(['learning_event', 'task_completion']).isRequired,
  targetId: PropTypes.string.isRequired,
  studentId: PropTypes.string,
  studentName: PropTypes.string,
  isFriend: PropTypes.bool,
  onHidden: PropTypes.func,
};
