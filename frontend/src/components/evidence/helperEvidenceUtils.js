import api from '../../services/api';
import { helperEvidenceAPI } from '../../services/api';
import toast from 'react-hot-toast';

/**
 * Process evidence items from EvidenceContentEditor and submit them
 * via the helper evidence API (for parents/advisors uploading on behalf of students).
 *
 * Handles file uploads and transforms the EvidenceContentEditor item structure
 * to match the helper evidence API format.
 *
 * @param {Object} params
 * @param {Array} params.items - Evidence items from EvidenceContentEditor onSave
 * @param {string} params.studentId - Student user ID
 * @param {string} params.taskId - Task ID to attach evidence to
 * @returns {Promise<{successCount: number, uploadFailures: number}>}
 */
export async function submitHelperEvidence({ items, studentId, taskId }) {
  let uploadFailures = 0;
  let successCount = 0;

  for (const item of items) {
    try {
      if (item.type === 'text') {
        await helperEvidenceAPI.uploadForStudent({
          student_id: studentId,
          task_id: taskId,
          block_type: 'text',
          content: { text: item.content.text }
        });
        successCount++;
      } else {
        // Non-text types have content.items array (images, videos, links, documents)
        for (const contentItem of (item.content.items || [])) {
          try {
            let fileUrl = contentItem.url;

            // Upload file if it's a File object (local upload)
            if (contentItem.file) {
              const formData = new FormData();
              formData.append('files', contentItem.file);
              const uploadRes = await api.post('/api/uploads/evidence', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              });
              if (uploadRes.data?.files?.length > 0) {
                fileUrl = uploadRes.data.files[0].url;
              } else {
                uploadFailures++;
                continue;
              }
            }

            // Skip blob URLs without files (safety check)
            if (fileUrl?.startsWith('blob:')) continue;
            if (!fileUrl) continue;

            // Build block content matching the helper API format
            const blockContent = {};
            switch (item.type) {
              case 'image':
                blockContent.url = fileUrl;
                blockContent.alt = contentItem.caption || contentItem.filename || 'Image';
                break;
              case 'video':
                blockContent.url = contentItem.url;
                break;
              case 'link':
                blockContent.url = contentItem.url;
                blockContent.title = contentItem.title || '';
                break;
              case 'document':
                blockContent.url = fileUrl;
                blockContent.title = contentItem.description || contentItem.title || contentItem.filename || 'Document';
                break;
            }

            await helperEvidenceAPI.uploadForStudent({
              student_id: studentId,
              task_id: taskId,
              block_type: item.type,
              content: blockContent
            });
            successCount++;
          } catch (err) {
            console.error('Error uploading evidence item:', err);
            uploadFailures++;
          }
        }
      }
    } catch (err) {
      console.error('Error submitting evidence:', err);
      uploadFailures++;
    }
  }

  return { successCount, uploadFailures };
}
