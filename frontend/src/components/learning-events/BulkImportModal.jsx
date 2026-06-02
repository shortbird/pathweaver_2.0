import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, PhotoIcon, ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { uploadViaSignedUrl } from '../../services/signedUpload';
import { detectMediaType, validateFileSize, formatFileSize, IMAGE_ACCEPT_STRING } from '../../utils/mediaUtils';

const MAX_IMAGES = 50;
const UPLOAD_CONCURRENCY = 3;

const initialItemState = (file) => {
  const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    file,
    previewUrl: URL.createObjectURL(file),
    status: 'pending', // pending | uploading | done | failed
    errorMessage: null,
  };
};

const BulkImportModal = ({ isOpen, onClose, onSuccess }) => {
  const [items, setItems] = useState([]);
  const [sharedDescription, setSharedDescription] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const fileInputRef = useRef(null);

  // Clean up object URLs when the modal closes or items change.
  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetState = () => {
    items.forEach((it) => {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
    });
    setItems([]);
    setSharedDescription('');
    setEventDate(new Date().toISOString().split('T')[0]);
    setIsSubmitting(false);
    setHasRun(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetState();
    onClose();
  };

  const addFiles = (filesList) => {
    const incoming = Array.from(filesList || []);
    if (incoming.length === 0) return;

    const accepted = [];
    const rejected = [];

    for (const file of incoming) {
      if (items.length + accepted.length >= MAX_IMAGES) {
        rejected.push(`${file.name}: limit of ${MAX_IMAGES} images per import`);
        continue;
      }
      const mediaType = detectMediaType(file);
      if (mediaType !== 'image') {
        rejected.push(`${file.name}: only images supported in bulk import`);
        continue;
      }
      const sizeCheck = validateFileSize(file, 'image');
      if (!sizeCheck.valid) {
        rejected.push(sizeCheck.error);
        continue;
      }
      accepted.push(initialItemState(file));
    }

    if (rejected.length > 0) {
      toast.error(rejected[0] + (rejected.length > 1 ? ` (+${rejected.length - 1} more)` : ''));
    }
    if (accepted.length > 0) {
      setItems((prev) => [...prev, ...accepted]);
    }
  };

  const removeItem = (id) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      const removed = prev.find((it) => it.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const importOne = async (item) => {
    updateItem(item.id, { status: 'uploading', errorMessage: null });
    try {
      const description =
        sharedDescription.trim() ||
        item.file.name.replace(/\.[^.]+$/, '') ||
        'Learning moment';

      const createPayload = { description };
      if (eventDate) createPayload.event_date = eventDate;

      const createResp = await api.post('/api/learning-events/quick', createPayload);
      const eventId = createResp.data?.event?.id;
      if (!eventId) throw new Error('Server did not return an event id');

      const uploadResult = await uploadViaSignedUrl({
        file: item.file,
        initPath: `/api/learning-events/${eventId}/upload-init`,
        finalizePath: `/api/learning-events/${eventId}/upload-finalize`,
        blockType: 'image',
      });

      const fileUrl = uploadResult.file_url || uploadResult.url;
      const filename = uploadResult.filename || uploadResult.file_name || item.file.name;
      if (!fileUrl) throw new Error('Upload did not return a file URL');

      await api.post(`/api/learning-events/${eventId}/evidence`, {
        blocks: [
          {
            block_type: 'image',
            content: { url: fileUrl, filename, alt: item.file.name },
            order_index: 0,
          },
        ],
      });

      updateItem(item.id, { status: 'done', errorMessage: null });
      return { ok: true };
    } catch (err) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Upload failed';
      updateItem(item.id, { status: 'failed', errorMessage: msg });
      return { ok: false };
    }
  };

  // Run uploads with a small concurrency cap. We re-read state inside the loop
  // by always grabbing items that are still pending/failed at the moment of
  // dispatch. Items are dispatched serially from a queue, but up to N run
  // concurrently.
  const runImport = async (subset) => {
    setIsSubmitting(true);
    setHasRun(true);

    const queue = [...subset];
    let inFlight = 0;
    let okCount = 0;
    let failCount = 0;

    await new Promise((resolve) => {
      const dispatch = () => {
        if (queue.length === 0 && inFlight === 0) {
          resolve();
          return;
        }
        while (inFlight < UPLOAD_CONCURRENCY && queue.length > 0) {
          const next = queue.shift();
          inFlight += 1;
          importOne(next).then((res) => {
            inFlight -= 1;
            if (res.ok) okCount += 1;
            else failCount += 1;
            dispatch();
          });
        }
      };
      dispatch();
    });

    setIsSubmitting(false);

    if (okCount > 0) {
      toast.success(
        failCount > 0
          ? `Imported ${okCount} moment${okCount === 1 ? '' : 's'}, ${failCount} failed`
          : `Imported ${okCount} moment${okCount === 1 ? '' : 's'}`
      );
      onSuccess?.();
    } else if (failCount > 0) {
      toast.error(`All ${failCount} uploads failed`);
    }
  };

  const handleSubmit = () => {
    const candidates = items.filter((it) => it.status === 'pending' || it.status === 'failed');
    if (candidates.length === 0) return;
    runImport(candidates);
  };

  const handleRetryFailed = () => {
    const failed = items.filter((it) => it.status === 'failed');
    if (failed.length === 0) return;
    runImport(failed);
  };

  if (!isOpen) return null;

  const pendingCount = items.filter((it) => it.status === 'pending').length;
  const doneCount = items.filter((it) => it.status === 'done').length;
  const failedCount = items.filter((it) => it.status === 'failed').length;
  const uploadingCount = items.filter((it) => it.status === 'uploading').length;
  const canSubmit = !isSubmitting && (pendingCount > 0 || failedCount > 0);

  const submitLabel = (() => {
    if (isSubmitting) return `Importing... (${doneCount + failedCount}/${items.length})`;
    if (hasRun && failedCount > 0 && pendingCount === 0) return `Retry ${failedCount} failed`;
    if (pendingCount > 0) return `Import ${pendingCount} moment${pendingCount === 1 ? '' : 's'}`;
    return 'Import';
  })();

  const modalContent = (
    <div
      className="fixed top-0 left-0 right-0 bottom-0 bg-black/50 flex items-center justify-center p-4"
      style={{ zIndex: 10000 }}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-1">Bulk Import Photos</h2>
              <p className="text-white/90 text-sm">
                Each photo becomes its own learning moment. Up to {MAX_IMAGES} images per batch.
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-white hover:text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Close"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Shared fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Description (applies to all)
              </label>
              <input
                type="text"
                value={sharedDescription}
                onChange={(e) => setSharedDescription(e.target.value)}
                placeholder="Leave blank to use each file's name"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-base bg-white"
                maxLength={500}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Date
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-base bg-white"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Picker / drop zone */}
          {items.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (isSubmitting) return;
                addFiles(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-optio-purple hover:bg-purple-50/50 transition-colors"
            >
              <PhotoIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-base font-medium text-gray-700 mb-1">
                Click to select photos or drag them here
              </p>
              <p className="text-sm text-gray-500">
                Images up to 10MB each. Pick as many as {MAX_IMAGES} at a time.
              </p>
            </div>
          ) : (
            <>
              {/* Status summary */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">
                  {items.length} photo{items.length === 1 ? '' : 's'} selected
                  {doneCount > 0 && <span className="text-green-600"> · {doneCount} done</span>}
                  {uploadingCount > 0 && <span className="text-optio-purple"> · {uploadingCount} uploading</span>}
                  {failedCount > 0 && <span className="text-red-600"> · {failedCount} failed</span>}
                </p>
                {!isSubmitting && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm font-medium text-optio-purple hover:text-optio-pink"
                  >
                    + Add more
                  </button>
                )}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200"
                  >
                    <img
                      src={it.previewUrl}
                      alt={it.file.name}
                      className="w-full h-full object-cover"
                    />

                    {/* Status overlay */}
                    {it.status === 'uploading' && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <ArrowPathIcon className="w-8 h-8 text-white animate-spin" />
                      </div>
                    )}
                    {it.status === 'done' && (
                      <div className="absolute inset-0 bg-green-600/30 flex items-center justify-center">
                        <CheckCircleIcon className="w-10 h-10 text-white drop-shadow" />
                      </div>
                    )}
                    {it.status === 'failed' && (
                      <div
                        className="absolute inset-0 bg-red-600/40 flex items-center justify-center"
                        title={it.errorMessage || 'Upload failed'}
                      >
                        <ExclamationCircleIcon className="w-10 h-10 text-white drop-shadow" />
                      </div>
                    )}

                    {/* Remove button (hidden while uploading or done) */}
                    {it.status !== 'uploading' && it.status !== 'done' && (
                      <button
                        onClick={() => removeItem(it.id)}
                        className="absolute top-1.5 right-1.5 p-1 bg-gray-900/70 text-white rounded-full hover:bg-gray-900"
                        aria-label={`Remove ${it.file.name}`}
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    )}

                    {/* Filename footer */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="text-xs text-white truncate" title={it.file.name}>
                        {it.file.name}
                      </p>
                      <p className="text-[10px] text-white/80">{formatFileSize(it.file.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={IMAGE_ACCEPT_STRING}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50 rounded-b-xl flex flex-col sm:flex-row gap-3 sm:justify-end">
          {hasRun && failedCount > 0 && pendingCount === 0 && !isSubmitting && (
            <button
              onClick={handleRetryFailed}
              className="min-h-[44px] px-6 py-2.5 border-2 border-red-300 text-red-700 rounded-xl hover:bg-red-50 transition-colors font-semibold"
            >
              Retry {failedCount} failed
            </button>
          )}
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="min-h-[44px] px-6 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hasRun && doneCount > 0 ? 'Done' : 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || items.length === 0}
            className="min-h-[44px] px-6 py-2.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold flex items-center justify-center gap-2"
          >
            {isSubmitting && (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            <span>{submitLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default BulkImportModal;
