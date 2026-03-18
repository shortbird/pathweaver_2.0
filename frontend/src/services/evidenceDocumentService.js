import api from './api';
import logger from '../utils/logger';

// Use the centralized authenticated API client
// This ensures Authorization headers are added via interceptors
const evidenceApi = {
  get: (path) => api.get(`/api/evidence${path}`),
  post: (path, data, config) => api.post(`/api/evidence${path}`, data, config),
  put: (path, data) => api.put(`/api/evidence${path}`, data),
  delete: (path) => api.delete(`/api/evidence${path}`),
};

export const evidenceDocumentService = {
  // Get evidence document for a task
  async getDocument(taskId) {
    try {
      const response = await evidenceApi.get(`/documents/${taskId}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching evidence document:', error);
      throw error;
    }
  },

  // Save evidence document (auto-save or manual save)
  async saveDocument(taskId, blocks, status = 'draft') {
    try {
      const response = await evidenceApi.post(`/documents/${taskId}`, {
        blocks,
        status
      });
      return response.data;
    } catch (error) {
      logger.error('Error saving evidence document:', error);
      throw error;
    }
  },

  // Update evidence document
  async updateDocument(taskId, blocks, status = 'draft') {
    try {
      const response = await evidenceApi.put(`/documents/${taskId}`, {
        blocks,
        status
      });
      return response.data;
    } catch (error) {
      logger.error('Error updating evidence document:', error);
      throw error;
    }
  },

  // Complete task with evidence document
  async completeTask(taskId) {
    try {
      const response = await evidenceApi.post(`/documents/${taskId}/complete`);
      return response.data;
    } catch (error) {
      logger.error('Error completing task:', error);
      throw error;
    }
  },

  // Upload file for a content block
  async uploadBlockFile(blockId, file, { onProgress } = {}) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // 2 minute timeout for video uploads
      };

      if (onProgress) {
        config.onUploadProgress = (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        };
      }

      const response = await evidenceApi.post(`/blocks/${blockId}/upload`, formData, config);
      return response.data;
    } catch (error) {
      logger.error('Error uploading file:', error);
      throw error;
    }
  },

  // Upload file for a task (before block is created)
  async uploadFile(file, taskId, { onProgress } = {}) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // 2 minute timeout for video uploads
      };

      if (onProgress) {
        config.onUploadProgress = (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        };
      }

      const response = await evidenceApi.post(`/documents/${taskId}/upload`, formData, config);
      return response.data;
    } catch (error) {
      logger.error('Error uploading file:', error);
      throw error;
    }
  },

  // Delete file from a content block
  async deleteBlockFile(blockId) {
    try {
      const response = await evidenceApi.delete(`/blocks/${blockId}/file`);
      return response.data;
    } catch (error) {
      logger.error('Error deleting file:', error);
      throw error;
    }
  },

  // Delete files from Supabase storage by URL
  async deleteStorageUrls(urls) {
    if (!urls || urls.length === 0) return { success: true, deleted: 0 };
    try {
      const response = await evidenceApi.post('/storage/delete-urls', { urls });
      return response.data;
    } catch (error) {
      logger.error('Error deleting storage files:', error);
      // Don't throw - storage cleanup is best-effort
      return { success: false, deleted: 0 };
    }
  },

  // Auto-save with debouncing
  createAutoSaver(taskId, onSaveSuccess, onSaveError) {
    let saveTimeout = null;
    let lastSaveTime = 0;
    let isDisabled = false;
    const SAVE_DEBOUNCE_DELAY = 1500; // 1.5 seconds (reduced for better UX)
    const MIN_SAVE_INTERVAL = 3000; // Minimum 3 seconds between saves

    return {
      autoSave: (blocks) => {
        if (isDisabled) {
          logger.debug('[AUTO-SAVE] Skipping - auto-save is disabled');
          return;
        }

        const now = Date.now();

        // Clear existing timeout
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }

        // If we just saved recently, wait longer
        const timeSinceLastSave = now - lastSaveTime;
        const delay = timeSinceLastSave < MIN_SAVE_INTERVAL
          ? MIN_SAVE_INTERVAL - timeSinceLastSave + SAVE_DEBOUNCE_DELAY
          : SAVE_DEBOUNCE_DELAY;

        saveTimeout = setTimeout(async () => {
          if (isDisabled) {
            logger.debug('[AUTO-SAVE] Skipping - auto-save was disabled while timeout pending');
            return;
          }

          try {
            logger.debug('[AUTO-SAVE] Executing auto-save with status: draft');
            const result = await this.saveDocument(taskId, blocks, 'draft');
            lastSaveTime = Date.now();
            if (onSaveSuccess) {
              onSaveSuccess(result);
            }
          } catch (error) {
            if (onSaveError) {
              onSaveError(error);
            }
          }
        }, delay);
      },

      clearAutoSave: () => {
        if (saveTimeout) {
          clearTimeout(saveTimeout);
          saveTimeout = null;
        }
      },

      disableAutoSave: () => {
        // Development logging removed
        // if (import.meta.env.DEV) {
        //   console.log('[AUTO-SAVE] Disabling auto-save permanently');
        // }
        isDisabled = true;
        if (saveTimeout) {
          clearTimeout(saveTimeout);
          saveTimeout = null;
        }
      }
    };
  }
};

export default evidenceDocumentService;