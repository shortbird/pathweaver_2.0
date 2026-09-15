import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import Button from '../ui/Button';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { QRCodeSVG } from 'qrcode.react';
import * as friends from '../../services/friendsAPI';

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
 * themselves live in backend/services/peer_policy_service.py.
 */

const SOURCES = [
  { key: 'classmates', label: 'Classmates', help: 'Students in the same class' },
  { key: 'code', label: 'A code shown in person', help: 'An 8-letter code that expires in a week' },
  { key: 'link', label: 'An invite link', help: 'The same code, shared as a link' },
  { key: 'school', label: 'Anyone at their school', help: 'Only if the school has turned this on' },
];

/** The code a friend's invite link carried in (/f/<CODE> -> /family?friend_code=). */
function codeFromUrl() {
  try {
    return friends.codeFrom(new URLSearchParams(window.location.search).get('friend_code')) || '';
  } catch {
    return '';
  }
}

const ChildFriendsCard = ({ studentId, studentName }) => {
  const [policy, setPolicy] = useState(null);
  const [canSet, setCanSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingOff, setConfirmingOff] = useState(null); // number of friends, when asking
  const [code, setCode] = useState(codeFromUrl);
  const [childCode, setChildCode] = useState(null);
  const [sending, setSending] = useState(false);

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

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/connections/children/${studentId}/policy`);
      const data = res.data?.data || res.data || {};
      setPolicy(data.policy || null);
      setCanSet(!!data.can_set);
    } catch {
      setPolicy(null);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const save = async (patch, successMessage) => {
    setSaving(true);
    try {
      const res = await api.put(`/api/connections/children/${studentId}/policy`, patch);
      const data = res.data?.data || res.data || {};
      setPolicy(data.policy || null);
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
      <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
        <div className="h-4 w-40 bg-gray-200 rounded mb-3" />
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
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600">
        <span className="font-medium text-gray-900">Friends</span> is not turned on at {studentName}&rsquo;s school.
      </div>
    );
  }

  if (!canSet) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600">
        <span className="font-medium text-gray-900">Friends: {enabled ? 'On' : 'Off'}</span>
        {' '}&middot; {policy.reason || 'Another adult on this account decides this setting.'}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <UserGroupIcon className={`h-6 w-6 flex-shrink-0 mt-0.5 ${enabled ? 'text-optio-purple' : 'text-gray-400'}`} />
          <div>
            <h3 className="font-semibold text-gray-900">
              Friends: {enabled ? 'On' : 'Off'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {enabled
                ? `${studentName} can be friends with other students. Friends see each other's work and can leave encouragement on it. You are told each time a friend is added.`
                : `${studentName} cannot send or receive friend requests. Turning Friends on is your consent to share ${studentName}'s work with the friends they make.`}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          {enabled ? (
            <Button variant="secondary" onClick={askToTurnOff} disabled={saving}>
              Turn off
            </Button>
          ) : (
            <Button variant="primary" onClick={() => save({ enabled: true }, `Friends is on for ${studentName}`)} disabled={saving} loading={saving}>
              Turn on
            </Button>
          )}
        </div>
      </div>

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

      {enabled && (
        <div className="mt-5 border-t border-gray-200 pt-4 space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900">New friends</legend>
            <div className="mt-2 space-y-2">
              {[
                { key: 'auto', label: 'Add right away and tell me', help: 'The friend is added when both students say yes.' },
                { key: 'ask_first', label: 'Ask me first', help: 'Nothing is shared until you approve each friend.' },
              ].map((opt) => (
                <label key={opt.key} className="flex items-start gap-2 text-sm cursor-pointer">
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
                    <span className="block text-gray-500">{opt.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-gray-900">Who can ask {studentName} to be friends</legend>
            <div className="mt-2 space-y-2">
              {SOURCES.map((src) => (
                <label key={src.key} className="flex items-start gap-2 text-sm cursor-pointer">
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
                    <span className="block text-gray-500">{src.help}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-gray-500">You can always connect {studentName} with a friend yourself.</p>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-gray-900">Connect {studentName} with a friend</legend>
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

          <fieldset>
            <legend className="text-sm font-medium text-gray-900">Friends can</legend>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2 text-sm text-gray-500">
                <input type="checkbox" checked readOnly disabled className="mt-1" />
                <span>See {studentName}&rsquo;s work</span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={friendsCan.includes('comment')}
                  onChange={(e) => save({ friends_can: e.target.checked ? ['see', 'comment'] : ['see'] })}
                  disabled={saving}
                  className="mt-1"
                />
                <span className="text-gray-900">Comment on {studentName}&rsquo;s work</span>
              </label>
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
};

export default ChildFriendsCard;
