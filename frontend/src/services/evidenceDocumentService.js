import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api/v3/evidence`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending cookies with requests
});

export const evidenceDocumentService = {
  // Get evidence document for a task
  async getDocument(taskId) {
    try {
      const response = await api.get(`/documents/${taskId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching evidence document:', error);
      throw error;
    }
  },

  // Save evidence document (auto-save or manual save)
  async saveDocument(taskId, blocks, status = 'draft') {
    try {
      const response = await api.post(`/documents/${taskId}`, {
        blocks,
        status
      });
      return response.data;
    } catch (error) {
      console.error('Error saving evidence document:', error);
      throw error;
    }
  },

  // Update evidence document
  async updateDocument(taskId, blocks, status = 'draft') {
    try {
      const response = await api.put(`/documents/${taskId}`, {
        blocks,
        status
      });
      return response.data;
    } catch (error) {
      console.error('Error updating evidence document:', error);
      throw error;
    }
  },

  // Complete task with evidence document
  async completeTask(taskId) {
    try {
      const response = await api.post(`/documents/${taskId}/complete`);
      return response.data;
    } catch (error) {
      console.error('Error completing task:', error);
      throw error;
    }
  },

  // Upload file for a content block
  async uploadBlockFile(blockId, file) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post(`/blocks/${blockId}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  },

  // Auto-save with debouncing
  createAutoSaver(taskId, onSaveSuccess, onSaveError) {
    let saveTimeout = null;
    let lastSaveTime = 0;
    const SAVE_DEBOUNCE_DELAY = 3000; // 3 seconds
    const MIN_SAVE_INTERVAL = 5000; // Minimum 5 seconds between saves

    return {
      autoSave: (blocks) => {
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
          try {
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
      }
    };
  }
};

export default evidenceDocumentService;