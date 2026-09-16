import React, { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import Button from '../ui/Button';
import { QRCodeSVG } from 'qrcode.react';
import * as friends from '../../services/friendsAPI';
import { AttachmentList } from '../communication/MessageParts';
import FriendsHowItWorks from './FriendsHowItWorks';

// A held text names the other child (a comment, a direct message) or the
// room (a class chat message, since 2026-09-15).
const holdWhat = (h) => (h.surface === 'peer_comment' ? 'a comment' : 'a message')
const holdWhere = (h) => (h.group ? `in ${h.group.name}` : `to ${h.peer?.display_name || 'a friend'}`)


/**
 * ChildFriendsCard - a parent's Friends settings for one child.
 *
 * Until 2026-09-16 a parent's only say in their child's friendships was a
 * yes/no on each request, delivered by email, for both families -- and one
 * month in, the whole platform held one active connection. The consent is
 * now this card: the parent turns Friends on once, chooses the rules, and
 * is told of every friend after the fact. "Ask me first" is still here for
 * the family that wants the old behaviour.
 *
 * Turning Friends OFF ends every friendship the child has, and the confirm
 * step says how many. A parent who flips it off expects the friends to be
 * gone, not hidden behind a switch that could flip back.
 *
 * Backed by GET/PUT /api/connections/children/<id>/policy. The rules
 * themselves live in backend/services/peer_policy_service.py. The policy
 * is the react-query row ['connections', 'policy', <id>] that the family
 * dashboard's nudge, the explainer modal and the settings section header
 * all read, so a save here is seen everywhere at once.
 *
 * This is the body of the Friends section of the child's settings
 * (ChildSettingsPanel), which owns the heading and the on/off summary; the
 * card carries no chrome of its own. While Friends is off it shows the
 * whole explanation (FriendsHowItWorks) above the switch, so "all the
 * details" are here and not only in the modal a parent may never open.
 */

const SOURCES = [
  { key: 'classmates', label: 'Classmates', help: 'Students in the same class' },
  { key: 'code', label: 'A code shown in person', help: 'An 8-letter code that expires in a week' },
  { key: 'link', label: 'An invite link', help: 'The same code, shared as a link' },
  { key: 'school', label: 'Anyone at their school', help: 'Only if the school has turned this on' },
];

const HIDDEN_BY = {
  parent: 'Hidden by you',
  report: 'Taken down after a report',
  screen: 'Hidden by the safety check',
};

/** friends_can with one grant added or removed. 'see' is the floor and the
 *  server keeps it; the order is the server's too. */
function toggleGrant(current, key, on) {
  const rest = (current || []).filter((k) => k !== key);
  return on ? [...rest, key] : rest;
}

/** The code a friend's invite link carried in (/f/<CODE> -> /family?friend_code=). */
function codeFromUrl() {
  try {
    return friends.codeFrom(new URLSearchParams(window.location.search).get('friend_code')) || '';
  } catch {
    return '';
  }
}

const ChildFriendsCard = ({ studentId, studentName }) => {
  const queryClient = useQueryClient();
  const policyKey = ['connections', 'policy', studentId];
  const { data: policyData, isLoading: loading } = useQuery({
    queryKey: policyKey,
    queryFn: () => friends.getChildPolicy(studentId),
    enabled: !!studentId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });
  const policy = policyData?.policy || null;
  const canSet = !!policyData?.can_set;
  const [saving, setSaving] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [confirmingOff, setConfirmingOff] = useState(null); // number of friends, when asking
  const [code, setCode] = useState(codeFromUrl);
  const [childCode, setChildCode] = useState(null);
  const [sending, setSending] = useState(false);
  // What happened lately (phase 3 brought it to the web with the hide):
  // comments given and received, reactions, and anything the safety check
  // held. Loaded once Friends is on.
  const [activity, setActivity] = useState(null);
  const [hidingId, setHidingId] = useState(null);

  const loadActivity = useCallback(async () => {
    try {
      const d = await friends.getChildActivity(studentId, 30);
      setActivity({ comments: d.comments || [], reactions: d.reactions || [], holds: d.holds || [] });
    } catch {
      setActivity({ comments: [], reactions: [], holds: [] });
    }
  }, [studentId]);

  const hideComment = async (entry) => {
    setHidingId(entry.id);
    try {
      await friends.hidePeerComment(entry.id);
      setActivity((prev) => prev ? {
        ...prev,
        comments: prev.comments.map((x) => x.id === entry.id
          ? { ...x, hidden_at: new Date().toISOString(), hidden_reason: 'parent' }
          : x),
      } : prev);
      toast.success('Comment hidden.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not hide that comment.');
    } finally {
      setHidingId(null);
    }
  };

  // A parent connects the child by the other student's code (or the link it
  // came in), or hands the child's own code to the other family. Both go
  // through student scope: the request is the child's, made by the parent.
  const sendCode = async (e) => {
    e.preventDefault();
    if (code.trim().length !== 8) return;
    setSending(true);
    try {
      await friends.requestFriend({ code, studentId });
      setCode('');
      toast.success('Request sent. The other student, or their parent, will see it next.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send that request.');
    } finally {
      setSending(false);
    }
  };

  const getChildCode = async () => {
    setSending(true);
    try {
      setChildCode(await friends.issueCode(studentId));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create a code.');
    } finally {
      setSending(false);
    }
  };

  const copyChildLink = async () => {
    if (!childCode) return;
    await navigator.clipboard.writeText(friends.inviteLinkFor(childCode.code));
    toast.success('Link copied. It works for a week.');
  };

  const policyOn = !!policy?.enabled;
  useEffect(() => { if (policyOn) loadActivity(); }, [policyOn, loadActivity]);

  const save = async (patch, successMessage) => {
    setSaving(true);
    try {
      const res = await api.put(`/api/connections/children/${studentId}/policy`, patch);
      const data = res.data?.data || res.data || {};
      queryClient.setQueryData(policyKey, (prev) => ({ ...(prev || {}), policy: data.policy || null, can_set: canSet }));
      if (successMessage) toast.success(successMessage);
      if (data.revoked_count > 0) {
        toast.success(`${data.revoked_count} friend${data.revoked_count === 1 ? '' : 's'} removed`);
      }
    } catch (e) {
      toast.error(e.response?.data?.error || e.response?.data?.message || 'Could not save Friends settings');
    } finally {
      setSaving(false);
      setConfirmingOff(null);
    }
  };

  const askToTurnOff = async () => {
    try {
      const res = await api.get(`/api/connections/children/${studentId}/friends-count`);
      setConfirmingOff((res.data?.data || res.data || {}).active || 0);
    } catch {
      setConfirmingOff(0);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse py-1">
        <div className="h-3 w-64 bg-gray-100 rounded" />
      </div>
    );
  }

  if (!policy) return null;

  const enabled = !!policy.enabled;
  const moduleOff = policy.origin === 'module_off';
  const sources = policy.request_sources || [];
  const friendsCan = policy.friends_can || [];

  if (moduleOff) {
    return (
      <p className="text-base text-gray-600">
        Friends is not turned on at {studentName}&rsquo;s school.
      </p>
    );
  }

  if (!canSet) {
    return (
      <p className="text-base text-gray-600">
        <span className="font-medium text-gray-900">Friends is {enabled ? 'on' : 'off'} for {studentName}.</span>
        {' '}{policy.reason || 'Another adult on this account decides this setting.'}
      </p>
    );
  }

  if (!enabled) {
    // Off: the explanation is the section, and the switch is under it.
    return (
      <div>
        <FriendsHowItWorks name={studentName} />
        <div className="mt-5 pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-base text-gray-600">
            Turning Friends on is your consent to share {studentName}&rsquo;s work with the friends they make.
          </p>
          <Button variant="primary" size="sm" onClick={() => save({ enabled: true }, `Friends is on for ${studentName}`)} disabled={saving} loading={saving} className="flex-shrink-0">
            Turn on Friends
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-base text-gray-600">
          {studentName} can be friends with other students. You are told each time a friend is added.
          {' '}
          <button type="button" onClick={() => setShowHow((v) => !v)} className="font-medium text-optio-purple hover:underline">
            {showHow ? 'Hide how it works' : 'How it works'}
          </button>
        </p>
        <Button variant="secondary" size="sm" onClick={askToTurnOff} disabled={saving} className="flex-shrink-0">
          Turn off
        </Button>
      </div>
      {showHow && <FriendsHowItWorks name={studentName} className="mt-3 rounded-lg bg-gray-50 p-4" />}

      {confirmingOff !== null && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800">
            {confirmingOff > 0
              ? `This removes ${confirmingOff} friend${confirmingOff === 1 ? '' : 's'}. They will need to be added again.`
              : `${studentName} has no friends yet. Turning Friends off stops new requests.`}
          </p>
          <div className="flex gap-2 mt-3">
            <Button variant="danger" size="sm" onClick={() => save({ enabled: false }, `Friends is off for ${studentName}`)} disabled={saving} loading={saving}>
              Turn Friends off
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmingOff(null)} disabled={saving}>
              Keep it on
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
        <fieldset>
          <legend className="text-base font-medium text-gray-900">New friends</legend>
          <div className="mt-2 space-y-2">
            {[
              { key: 'auto', label: 'Add right away and tell me', help: 'The friend is added when both students say yes.' },
              { key: 'ask_first', label: 'Ask me first', help: 'Nothing is shared until you approve each friend.' },
            ].map((opt) => (
              <label key={opt.key} className="flex items-start gap-2 text-base cursor-pointer">
                <input
                  type="radio"
                  name={`approval-${studentId}`}
                  checked={policy.approval_mode === opt.key}
                  onChange={() => save({ approval_mode: opt.key })}
                  disabled={saving}
                  className="mt-1"
                />
                <span>
                  <span className="text-gray-900">{opt.label}</span>
                  <span className="block text-sm text-gray-500">{opt.help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-base font-medium text-gray-900">Who can ask {studentName} to be friends</legend>
          <div className="mt-2 space-y-2">
            {SOURCES.map((src) => (
              <label key={src.key} className="flex items-start gap-2 text-base cursor-pointer">
                <input
                  type="checkbox"
                  checked={sources.includes(src.key)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...sources, src.key]
                      : sources.filter((s) => s !== src.key);
                    save({ request_sources: next });
                  }}
                  disabled={saving}
                  className="mt-1"
                />
                <span>
                  <span className="text-gray-900">{src.label}</span>
                  <span className="block text-sm text-gray-500">{src.help}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-gray-500">You can always connect {studentName} with a friend yourself.</p>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-base font-medium text-gray-900">Friends can</legend>
          <div className="mt-2 space-y-2">
            <label className="flex items-start gap-2 text-base text-gray-500">
              <input type="checkbox" checked readOnly disabled className="mt-1" />
              <span>See {studentName}&rsquo;s work</span>
            </label>
            <label className="flex items-start gap-2 text-base cursor-pointer">
              <input
                type="checkbox"
                checked={friendsCan.includes('comment')}
                onChange={(e) => save({ friends_can: toggleGrant(friendsCan, 'comment', e.target.checked) })}
                disabled={saving}
                className="mt-1"
              />
              <span className="text-gray-900">Comment on {studentName}&rsquo;s work</span>
            </label>
            <label className="flex items-start gap-2 text-base cursor-pointer">
              <input
                type="checkbox"
                checked={friendsCan.includes('message')}
                onChange={(e) => save({ friends_can: toggleGrant(friendsCan, 'message', e.target.checked) })}
                disabled={saving}
                className="mt-1"
              />
              <span>
                <span className="text-gray-900">Message {studentName}</span>
                <span className="block text-xs text-gray-500">
                  Only with friends whose family also allows it. Every message is checked by our safety screen, and you can read {studentName}&rsquo;s messages from the Messages page.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-base font-medium text-gray-900">Connect {studentName} with a friend</legend>
          <p className="text-xs text-gray-500 mt-1">Ask the other family for their child&rsquo;s code, or send them {studentName}&rsquo;s.</p>
          <form onSubmit={sendCode} className="mt-2 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="Their code, e.g. ABCD2345"
              aria-label="Enter their code"
              className="flex-1 min-w-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono tracking-widest"
            />
            <Button type="submit" size="sm" disabled={sending || code.trim().length !== 8}>Send request</Button>
          </form>
          <div className="mt-3">
            {childCode ? (
              <div className="flex items-center gap-4">
                <QRCodeSVG value={friends.inviteLinkFor(childCode.code)} size={88} />
                <div>
                  <p className="font-mono text-lg tracking-widest text-optio-purple" aria-label={`${studentName}'s code is ${childCode.code}`}>{childCode.code}</p>
                  <div className="flex gap-2 mt-1">
                    <button type="button" onClick={copyChildLink} className="text-sm font-medium text-optio-purple hover:underline">Copy link</button>
                    <button type="button" onClick={getChildCode} disabled={sending} className="text-sm text-gray-500 hover:underline">New code</button>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" onClick={getChildCode} disabled={sending} className="text-sm font-medium text-optio-purple hover:underline">
                Get {studentName}&rsquo;s code
              </button>
            )}
          </div>
        </fieldset>

        <section aria-label="Last 30 days" className="sm:col-span-2 border-t border-gray-100 pt-4">
          <h4 className="text-base font-medium text-gray-900">Last 30 days</h4>
          {!activity ? (
            <p className="mt-2 text-sm text-gray-500">Loading&hellip;</p>
          ) : activity.comments.length + activity.reactions.length + activity.holds.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No comments or reactions yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {activity.holds.map((h) => (
                <li key={`h-${h.id}`} className="py-2" data-testid={`hold-${h.id}`}>
                  <p className="text-xs text-gray-500">
                    {h.stage === 'refused'
                      ? `${studentName} wrote ${holdWhat(h)} ${holdWhere(h)} that our safety check held. It was not sent.`
                      : `${studentName} sent ${holdWhat(h)} ${holdWhere(h)} that our safety check hid afterwards.`}
                  </p>
                  <p className="text-sm text-gray-900">{h.text}</p>
                  {/* The pictures the message carried, signed by the server. */}
                  <AttachmentList attachments={h.attachments} />
                  {h.reasons?.length > 0 && <p className="text-xs text-gray-500">{h.reasons.join('; ')}</p>}
                </li>
              ))}
              {activity.comments.map((e) => (
                <li key={`c-${e.id}`} className="py-2">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-xs text-gray-500">
                      {e.direction === 'received'
                        ? `${e.peer.display_name} commented on ${studentName}'s work`
                        : `${studentName} commented on ${e.peer.display_name}'s work`}
                    </p>
                    {e.direction === 'received' && !e.hidden_at && (
                      <button
                        type="button"
                        onClick={() => hideComment(e)}
                        disabled={hidingId === e.id}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        Hide
                      </button>
                    )}
                  </div>
                  <p className={`text-sm ${e.hidden_at ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{e.text}</p>
                  {e.hidden_at && <p className="text-xs text-gray-500">{HIDDEN_BY[e.hidden_reason] || 'Hidden'}</p>}
                </li>
              ))}
              {activity.reactions.map((r) => (
                <li key={`r-${r.id}`} className="py-1.5 text-xs text-gray-500">
                  {r.direction === 'received' ? `${r.peer.display_name} to ${studentName}` : `${studentName} to ${r.peer.display_name}`}: {r.label}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default ChildFriendsCard;
