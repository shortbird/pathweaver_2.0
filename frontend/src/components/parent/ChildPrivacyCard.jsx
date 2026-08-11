import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import Button from '../ui/Button';
import { GlobeAltIcon, LockClosedIcon, LinkIcon } from '@heroicons/react/24/outline';

/**
 * ChildPrivacyCard - a parent's controls over who can see their child's work.
 *
 * This is the surface that did not exist. A parent could previously approve a
 * child's request to publish, but could not publish, could not un-publish, and
 * could not see the truth about the current state: the dashboard read a table
 * that was never created and reported "private" unconditionally.
 *
 * Both directions are offered here, and making work private is deliberately
 * the low-friction one -- it takes a single click, with no confirmation step
 * standing between a parent and their child's privacy.
 *
 * Rendering is state-proportional: when the portfolio is private and nothing
 * needs a decision, this collapses to a one-line status strip so it doesn't
 * dominate the dashboard. The full card appears only when something is
 * actionable -- the portfolio is public, the state couldn't be read, the
 * child is waiting on approval -- or when the parent expands it.
 */
const ChildPrivacyCard = ({ studentId, studentName }) => {
  const [status, setStatus] = useState(null);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const [statusRes, sharesRes] = await Promise.all([
        api.get(`/api/portfolio/user/${studentId}/visibility-status`),
        api.get(`/api/portfolio/user/${studentId}/transcript-shares`).catch(() => null),
      ]);
      setStatus(statusRes.data?.data || statusRes.data || null);
      setShares(sharesRes?.data?.data?.shares || []);
    } catch (e) {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const setVisibility = async (makePublic) => {
    setSaving(true);
    try {
      await api.put(`/api/portfolio/user/${studentId}/privacy`, {
        is_public: makePublic,
        consent_acknowledged: makePublic,
      });
      toast.success(makePublic
        ? `${studentName}'s portfolio is now public`
        : `${studentName}'s portfolio is now private`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not update visibility');
    } finally {
      setSaving(false);
    }
  };

  const revokeShare = async (grantId) => {
    try {
      await api.delete(`/api/portfolio/user/${studentId}/transcript-shares/${grantId}`);
      toast.success('Link revoked');
      await load();
    } catch (e) {
      toast.error('Could not revoke that link');
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

  if (!status) return null;

  const isPublic = !!status.is_public;
  // The backend flags this when it could not read the real state. Guessing
  // "private" in that case is what misled parents before.
  const unknown = !!status.unknown;

  const activeShares = shares.filter((s) => s.is_active).length;
  // Private, readable, no pending request: nothing needs the parent's
  // attention, so stay out of the way unless they ask.
  const quiet = !isPublic && !unknown && !status.pending_parent_approval;

  if (quiet && !expanded) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 text-sm">
          <LockClosedIcon className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <span className="text-gray-600 truncate">
            <span className="font-medium text-gray-900">{studentName}&rsquo;s portfolio: Private</span>
            {activeShares > 0 && (
              <span>
                {' '}&middot; {activeShares} transcript link{activeShares === 1 ? '' : 's'} shared
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm font-medium text-optio-purple hover:underline flex-shrink-0"
        >
          Manage
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {isPublic
            ? <GlobeAltIcon className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            : <LockClosedIcon className="h-6 w-6 text-emerald-600 flex-shrink-0 mt-0.5" />}
          <div>
            <h3 className="font-semibold text-gray-900">
              Who can see {studentName}&rsquo;s work
            </h3>
            {unknown ? (
              <p className="text-sm text-amber-700 mt-1">
                We couldn&rsquo;t load the current setting. Please refresh &mdash;
                don&rsquo;t assume this portfolio is private.
              </p>
            ) : (
              <p className="text-sm text-gray-600 mt-1">
                {isPublic
                  ? 'Anyone with the link can view this portfolio, and search engines may index it.'
                  : 'Only you and the people you’ve connected — advisors and observers — can see this work.'}
              </p>
            )}
            {isPublic && status.consent_given_at && (
              <p className="text-xs text-gray-500 mt-1">
                Made public on {new Date(status.consent_given_at).toLocaleDateString()}
              </p>
            )}
            {isPublic && status.portfolio_slug && (
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/portfolio/${status.portfolio_slug}`}
                  onFocus={(e) => e.target.select()}
                  aria-label="Public portfolio link"
                  className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600 truncate"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${window.location.origin}/portfolio/${status.portfolio_slug}`);
                    toast.success('Link copied');
                  }}
                  className="flex-shrink-0 text-sm font-medium text-optio-purple hover:underline"
                >
                  Copy
                </button>
                <a
                  href={`/portfolio/${status.portfolio_slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-sm font-medium text-optio-purple hover:underline"
                >
                  View
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Button
            variant={isPublic ? 'secondary' : 'primary'}
            onClick={() => setVisibility(!isPublic)}
            disabled={saving}
            loading={saving}
          >
            {isPublic ? 'Make private' : 'Make public'}
          </Button>
          {quiet && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
            >
              Hide
            </button>
          )}
        </div>
      </div>

      {status.pending_parent_approval && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800">
            {studentName} has asked to share this portfolio publicly and is waiting
            on your decision.
          </p>
        </div>
      )}

      {shares.length > 0 && (
        <div className="mt-5 border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-2">
            Transcript links
          </h4>
          <ul className="space-y-2">
            {shares.map((share) => (
              <li key={share.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-gray-700 min-w-0">
                  <LinkIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{share.label || 'Transcript link'}</span>
                  <span className="text-gray-400 flex-shrink-0">
                    {share.is_active
                      ? `${share.view_count || 0} view${share.view_count === 1 ? '' : 's'}`
                      : 'inactive'}
                  </span>
                </span>
                {share.is_active && (
                  <button
                    type="button"
                    onClick={() => revokeShare(share.id)}
                    className="text-red-600 hover:underline flex-shrink-0"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ChildPrivacyCard;
