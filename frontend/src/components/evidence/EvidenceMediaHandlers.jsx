import { evidenceDocumentService } from '../../services/evidenceDocumentService';
import logger from '../../utils/logger';

/**
 * Handles file upload validation, preview creation, and Supabase storage
 */
export class EvidenceMediaHandlers {
  constructor({
    blocks,
    setBlocks,
    documentStatus,
    taskId,
    setUploadingBlocks,
    setUploadErrors,
    onError
  }) {
    this.blocks = blocks;
    this.setBlocks = setBlocks;
    this.documentStatus = documentStatus;
    this.taskId = taskId;
    this.setUploadingBlocks = setUploadingBlocks;
    this.setUploadErrors = setUploadErrors;
    this.onError = onError;
  }

  async uploadFileImmediately(file, blockId, blockType) {
    try {
      // Store file reference for retry
      this.setBlocks(prevBlocks => prevBlocks.map(block =>
        block.id === blockId
          ? {
              ...block,
              content: {
                ...block.content,
                _retryFile: file
              }
            }
          : block
      ));

      // Add to uploading set
      this.setUploadingBlocks(prev => new Set(prev).add(blockId));
      this.setUploadErrors(prev => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });

      // First, save the document to ensure block has a database ID
      const cleanedBlocks = this.cleanBlocksForSave(this.blocks);
      const saveResponse = await evidenceDocumentService.saveDocument(this.taskId, cleanedBlocks, this.documentStatus);

      if (saveResponse.success && saveResponse.blocks) {
        // Find the saved block by matching order_index
        const currentBlockIndex = this.blocks.findIndex(b => b.id === blockId);
        const savedBlock = saveResponse.blocks.find(sb => sb.order_index === currentBlockIndex);

        if (savedBlock?.id) {
          // Upload file to Supabase storage
          const uploadResponse = await evidenceDocumentService.uploadBlockFile(savedBlock.id, file);

          if (uploadResponse.success && uploadResponse.file_url) {
            // Update block with permanent URL and remove retry file
            this.setBlocks(prevBlocks => prevBlocks.map(block =>
              block.id === blockId
                ? {
                    ...block,
                    content: {
                      ...block.content,
                      url: uploadResponse.file_url,
                      filename: uploadResponse.filename,
                      _uploadComplete: true,
                      _retryFile: undefined
                    }
                  }
                : block
            ));

            // Revoke blob URL to free memory
            if (this.blocks.find(b => b.id === blockId)?.content.url?.startsWith('blob:')) {
              URL.revokeObjectURL(this.blocks.find(b => b.id === blockId).content.url);
            }
          } else {
            throw new Error(uploadResponse.error || 'Upload failed');
          }
        } else {
          throw new Error('Failed to get block database ID');
        }
      } else {
        throw new Error(saveResponse.error || 'Failed to save document');
      }

      // Remove from uploading set
      this.setUploadingBlocks(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });

    } catch (error) {
      logger.error(`Failed to upload file for block ${blockId}:`, error);
      this.setUploadErrors(prev => ({
        ...prev,
        [blockId]: error.message || 'Upload failed'
      }));
      this.setUploadingBlocks(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });

      if (this.onError) {
        this.onError(`Failed to upload ${file.name}: ${error.message}`);
      }
    }
  }

  async handleFileUpload(file, blockId, blockType) {
    try {
      // Validate file size (10MB limit)
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
      if (file.size > MAX_FILE_SIZE) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        const errorMsg = `File "${file.name}" is too large (${fileSizeMB}MB). Maximum size is 10MB.\n\nFor larger files, please:\n1. Upload to Google Drive or Dropbox\n2. Get a shareable link\n3. Use a "Link" block instead`;
        if (this.onError) {
          this.onError(errorMsg);
        }
        throw new Error(errorMsg);
      }

      // Create a temporary blob URL for immediate preview
      const localUrl = URL.createObjectURL(file);

      // Store file info for immediate preview
      const fileInfo = {
        file: file,
        localUrl: localUrl,
        name: file.name,
        size: file.size,
        type: file.type
      };

      // Trigger immediate upload in background
      this.uploadFileImmediately(file, blockId, blockType);

      return fileInfo;
    } catch (error) {
      logger.error('File preparation error:', error);
      if (this.onError && !error.message.includes('too large')) {
        this.onError(`Failed to prepare file: ${error.message}`);
      }
      throw error;
    }
  }

  cleanBlocksForSave(blocksToClean) {
    return blocksToClean.map(block => {
      const cleanedContent = { ...block.content };

      // Remove blob URLs - they're temporary and won't work after page reload
      // Keep permanent Supabase URLs
      if (cleanedContent.url && cleanedContent.url.startsWith('blob:')) {
        delete cleanedContent.url;
      }

      // Remove upload status flags and retry file references
      if (cleanedContent._uploadComplete) {
        delete cleanedContent._uploadComplete;
      }
      if (cleanedContent._retryFile) {
        delete cleanedContent._retryFile;
      }

      return {
        ...block,
        content: cleanedContent
      };
    });
  }
}

export default EvidenceMediaHandlers;
