import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { observerAPI } from '../services/api';
import FeedCard from '../components/observer/FeedCard';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import EmptyState from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import {
  SparklesIcon,
  ArrowRightIcon,
  HeartIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { useConfirm } from '../contexts/ConfirmContext'

export default function StudentFeedbackPage() {
  const confirm = useConfirm()
  const { user } = useAuth();
  const [feedItems, setFeedItems] = useState([]);
  const [peerCount, setPeerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Observer management state
  const [viewers, setViewers] = useState([]);
  const [observersLoading, setObserversLoading] = useState(true);
  const [showObserverPanel, setShowObserverPanel] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [linkGenerating, setLinkGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    if (user?.id) {
      fetchActivityFeed();
      fetchObserverData();
    }
  }, [user?.id]);

  // Own work + connected peers', interleaved by time. The peer half is why
  // this page and its nav item dropped the "My": /api/connections/feed returns
  // the student's own items when they have no connections, so the call is the
  // same either way and there is no empty state to special-case.
  //
  // The backend drops peers' `is_confidential` items before assembly, so
  // nothing here has to remember to filter them. Your own hidden items still
  // arrive (FeedCard greys them and offers unhide), which is the behaviour this
  // page has always had.
  const fetchActivityFeed = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/api/connections/feed');
      const data = response.data?.data || response.data;
      setFeedItems(data.items || []);
      setPeerCount(data.peer_count || 0);
    } catch (err) {
      console.error('Failed to fetch activity feed:', err);
      setError('Failed to load your activity. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchObserverData = async () => {
    setObserversLoading(true);
    try {
      const res = await observerAPI.getMyObservers().catch(() => ({ data: { viewers: [] } }));
      setViewers(res.data.viewers || []);
    } catch (err) {
      console.error('Failed to fetch observer data:', err);
    } finally {
      setObserversLoading(false);
    }
  };

  const handleGenerateLink = async () => {
    setLinkGenerating(true);
    try {
      const response = await observerAPI.generateInviteLink();
      setGeneratedLink({
        link: response.data.shareable_link,
        expiresAt: response.data.expires_at
      });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to generate invitation link';
      toast.error(msg);
    } finally {
      setLinkGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (generatedLink?.link) {
      try {
        await navigator.clipboard.writeText(generatedLink.link);
        setCopied(true);
        toast.success('Link copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleRemoveObserver = async (linkId, observerName) => {
    if (!(await confirm(`Remove ${observerName} as an observer? They will no longer be able to view your activity.`))) {
      return;
    }
    setRemovingId(linkId);
    try {
      await observerAPI.removeMyObserver(linkId);
      setViewers(prev => prev.filter(v => v.link_id !== linkId));
      toast.success(`${observerName} has been removed`);
    } catch (err) {
      toast.error('Failed to remove observer');
    } finally {
      setRemovingId(null);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const viewerCount = viewers.length;

  // --- Observer Panel Component (shared between mobile/desktop) ---
  const ObserverPanel = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Toggle Header */}
      <button
        onClick={() => setShowObserverPanel(!showObserverPanel)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 flex items-center justify-center">
            <EyeIcon className="w-4 h-4 text-optio-purple" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Observers</h2>
            <p className="text-xs text-gray-500">
              {observersLoading ? 'Loading...' : `${viewerCount} ${viewerCount === 1 ? 'viewer' : 'viewers'}`}
            </p>
          </div>
        </div>
        {showObserverPanel
          ? <ChevronUpIcon className="w-4 h-4 text-gray-400" />
          : <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        }
      </button>

      {/* Expandable Content */}
      {showObserverPanel && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {/* Generate Link / Show Link */}
          {!generatedLink ? (
            <button
              onClick={handleGenerateLink}
              disabled={linkGenerating}
              className="btn-primary w-full"
            >
              <LinkIcon className="w-4 h-4" />
              {linkGenerating ? 'Generating...' : 'Create an invite link'}
            </button>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
              <p className="text-xs font-medium text-green-800">
                Send this link to one person, or have them scan the code while you're together.
                It works once and then stops.
              </p>

              {/* Link + Copy */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={generatedLink.link}
                  readOnly
                  className="flex-1 px-2 py-1.5 text-xs bg-white border border-green-300 rounded-lg min-w-0"
                />
                <button
                  onClick={handleCopyLink}
                  className="shrink-0 flex items-center px-2 py-1.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors text-xs"
                >
                  {copied ? (
                    <CheckIcon className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* QR Code */}
              <div className="flex flex-col items-center gap-1.5 pt-1">
                <div className="bg-white p-2.5 rounded-lg border border-green-200">
                  <QRCodeSVG
                    value={generatedLink.link}
                    size={140}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <p className="text-[10px] text-green-600">
                  One person only. Expires {formatDate(generatedLink.expiresAt)}.
                </p>
              </div>

              <button
                onClick={() => { setGeneratedLink(null); setCopied(false); }}
                className="text-xs text-green-700 hover:text-green-800 underline"
              >
                Create another link for someone else
              </button>
            </div>
          )}

          {/* Viewers List */}
          {viewers.length > 0 && (
            <div className="space-y-1.5">
              {viewers.map((viewer, idx) => (
                <div key={`${viewer.type}-${viewer.link_id || idx}`} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                  <div className="min-w-0 flex items-center gap-2">
                    {viewer.type === 'platform' ? (
                      <img
                        src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg"
                        alt="Optio"
                        className="w-7 h-7 shrink-0"
                      />
                    ) : viewer.image_url ? (
                      <img
                        src={viewer.image_url}
                        alt={viewer.name}
                        className="w-7 h-7 rounded-full object-contain bg-white shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        <span className="text-gray-600 text-[10px] font-bold">
                          {viewer.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-xs truncate">{viewer.name}</p>
                      <p className="text-[10px] text-gray-500">{viewer.detail}</p>
                    </div>
                  </div>
                  {viewer.removable && (
                    <button
                      onClick={() => handleRemoveObserver(viewer.link_id, viewer.name)}
                      disabled={removingId === viewer.link_id}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 shrink-0"
                      title={`Remove ${viewer.name}`}
                    >
                      {removingId === viewer.link_id ? (
                        <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      ) : (
                        <TrashIcon className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <PageLoader className="min-h-[400px]" />
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Feed</h1>
        <p className="text-gray-600">
          {peerCount > 0
            ? "Your work, your connected friends' work, and feedback from your observers."
            : 'See your completed work and feedback from your observers.'}
        </p>
        {peerCount === 0 && (
          <Link
            to="/connections"
            className="inline-flex items-center gap-1 mt-2 text-sm text-optio-purple hover:text-optio-pink font-medium"
          >
            Connect with another student
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Mobile: Observer panel on top */}
      <div className="lg:hidden mb-6">
        <ObserverPanel />
      </div>

      {/* Desktop: Two-column layout */}
      <div className="flex gap-6">
        {/* Feed Column */}
        <div className="flex-1 min-w-0">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {feedItems.length === 0 ? (
            <EmptyState
              icon={SparklesIcon}
              title="No Activity Yet"
              hint="Complete some tasks to see your activity here. When observers leave comments or likes, you'll see them too!"
              action={(
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 text-optio-purple hover:text-optio-pink font-medium"
                >
                  Go to Dashboard
                  <ArrowRightIcon className="w-4 h-4" />
                </Link>
              )}
            />
          ) : (
            <div className="space-y-4">
              {feedItems.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  showStudentName={true}
                  isStudentView={true}
                />
              ))}
            </div>
          )}

          {/* Encouragement Note */}
          {feedItems.length > 0 && (
            <div className="mt-8 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-6 border border-optio-purple/10">
              <div className="flex items-start gap-4">
                <HeartIcon className="w-6 h-6 text-optio-purple shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">
                    Keep up the great work!
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Your observers can see your progress and leave encouraging comments.
                    Remember: the process is the goal.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop: Observer panel as sidebar */}
        <div className="hidden lg:block w-72 shrink-0">
          <div className="sticky top-20">
            <ObserverPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
