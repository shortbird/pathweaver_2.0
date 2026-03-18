import { useState, useCallback } from 'react';
import {
  detectMediaType,
  validateFileSize,
  isValidUrl,
  validateVideoDuration,
} from '../utils/mediaUtils';

/**
 * Shared hook for managing media attachments and links.
 * Encapsulates the file-selection, preview, and link lifecycle
 * duplicated between Parent and Advisor capture modals.
 *
 * Upload orchestration stays with the consumer (different
 * endpoints per role).
 *
 * @param {Object} options
 * @param {boolean} options.validateDuration - Run client-side video duration check (default false)
 */
export default function useMediaAttachments({ validateDuration = false } = {}) {
  const [attachments, setAttachments] = useState([]);
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  let idCounter = 0;
  const nextId = () => `att_${Date.now()}_${idCounter++}`;

  /**
   * Process an array of File objects: detect type, validate size,
   * optionally validate video duration, create blob preview, and
   * append to attachments state.
   *
   * @param {File[]} files
   * @param {'camera'|'document'} sourceType
   * @returns {Promise<{errors: string[]}>}
   */
  const addFiles = useCallback(async (files, sourceType = 'camera') => {
    const errors = [];
    const newAttachments = [];

    for (const file of files) {
      let mediaType;
      if (sourceType === 'camera') {
        mediaType = detectMediaType(file);
      } else if (sourceType === 'document') {
        mediaType = 'document';
      } else {
        mediaType = detectMediaType(file);
      }

      // Size check
      const sizeResult = validateFileSize(file, mediaType);
      if (!sizeResult.valid) {
        errors.push(sizeResult.error);
        continue;
      }

      // Optional duration check for video
      if (validateDuration && mediaType === 'video') {
        const durationResult = await validateVideoDuration(file);
        if (!durationResult.valid) {
          errors.push(durationResult.message);
          continue;
        }
      }

      const hasPreview = mediaType === 'image' || mediaType === 'video';
      newAttachments.push({
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        file,
        preview: hasPreview ? URL.createObjectURL(file) : null,
        type: mediaType,
        filename: file.name,
        size: file.size,
        uploading: false,
        uploaded: false,
        fileUrl: null,
      });
    }

    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments]);
    }

    return { errors };
  }, [validateDuration]);

  /**
   * Remove an attachment by id (revokes its blob URL).
   */
  const removeAttachment = useCallback((id) => {
    setAttachments(prev => {
      const removed = prev.find(a => a.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  /**
   * Add the current linkInput value as a new link.
   * Returns { success: true } or { success: false, error: string }.
   */
  const addLink = useCallback(() => {
    const trimmed = linkInput.trim();
    if (!trimmed) return { success: false, error: 'No URL entered' };
    if (!isValidUrl(trimmed)) {
      return { success: false, error: 'Please enter a valid URL (e.g., https://example.com)' };
    }
    setLinks(prev => [...prev, { url: trimmed }]);
    setLinkInput('');
    setShowLinkInput(false);
    return { success: true };
  }, [linkInput]);

  /**
   * Remove a link by index.
   */
  const removeLink = useCallback((index) => {
    setLinks(prev => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Mark an attachment as uploading.
   */
  const markUploading = useCallback((id) => {
    setAttachments(prev => prev.map(a =>
      a.id === id ? { ...a, uploading: true } : a
    ));
  }, []);

  /**
   * Mark an attachment as uploaded with its permanent URL.
   */
  const markUploaded = useCallback((id, fileUrl, meta = {}) => {
    setAttachments(prev => prev.map(a =>
      a.id === id ? {
        ...a,
        uploading: false,
        uploaded: true,
        fileUrl,
        filename: meta.file_name || a.filename,
        size: meta.file_size || a.size,
      } : a
    ));
  }, []);

  /**
   * Reset all state and revoke every blob URL.
   */
  const reset = useCallback(() => {
    setAttachments(prev => {
      prev.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); });
      return [];
    });
    setLinks([]);
    setLinkInput('');
    setShowLinkInput(false);
  }, []);

  return {
    attachments,
    links,
    linkInput,
    setLinkInput,
    showLinkInput,
    setShowLinkInput,
    addFiles,
    removeAttachment,
    addLink,
    removeLink,
    markUploading,
    markUploaded,
    reset,
  };
}
