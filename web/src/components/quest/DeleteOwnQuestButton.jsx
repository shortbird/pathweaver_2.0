import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TrashIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import ModalOverlay from '../ui/ModalOverlay';

/**
 * "Delete quest" on the quest page, with its confirmation dialog.
 *
 * Ticket bd1be541, Karen Boyd: "I created a couple of quests that I ended up
 * not wanting to use... I can't see how to delete old quests". Offered only
 * for a quest the family made that has no finished task and no evidence; the
 * server decides (GET /own-quest) and checks again on delete. Everything else
 * keeps Save for later > "I'm done with it".
 *
 * `refreshKey` re-asks the server when the page's progress changes, because a
 * task finished since the last answer takes the offer away.
 */
const DeleteOwnQuestButton = ({ questId, enrollmentId, scopeParams, refreshKey }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [canDelete, setCanDelete] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!questId || !enrollmentId) {
      setCanDelete(false);
      return undefined;
    }
    let cancelled = false;
    api.get(`/api/quests/${questId}/own-quest`, { params: scopeParams })
      .then((res) => { if (!cancelled) setCanDelete(res?.data?.can_delete === true); })
      .catch(() => { if (!cancelled) setCanDelete(false); });
    return () => { cancelled = true; };
  }, [questId, enrollmentId, scopeParams, refreshKey]);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await api.delete(`/api/quests/${questId}/own-quest`, { params: scopeParams });
      setConfirming(false);
      toast.success(res?.data?.message || 'Quest deleted');
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      navigate('/dashboard');
    } catch (err) {
      setConfirming(false);
      setCanDelete(false);
      toast.error(err?.response?.data?.error || 'Could not delete this quest. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (!canDelete) return null;

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={deleting}
        className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-red-700 border border-red-300 rounded-full hover:bg-red-50 transition-all text-sm font-medium shadow-sm disabled:opacity-50 min-h-[44px] touch-manipulation"
      >
        <TrashIcon className="w-4 h-4" aria-hidden="true" />
        <span>Delete quest</span>
      </button>
      {confirming && (
        <ModalOverlay onClose={() => { if (!deleting) setConfirming(false); }}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Delete this quest?</h3>
            <p className="text-sm text-gray-600 mb-6">
              The quest and its tasks will be deleted. Nothing has been finished on it yet, so no work or XP is lost. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(false)}
                className="btn-quiet min-h-[44px] touch-manipulation"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="btn-danger min-h-[44px] touch-manipulation"
              >
                {deleting ? 'Deleting...' : 'Delete quest'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
};

export default DeleteOwnQuestButton;
