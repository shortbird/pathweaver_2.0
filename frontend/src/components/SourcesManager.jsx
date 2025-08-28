import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const SourcesManager = ({ onClose }) => {
  const [sources, setSources] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploadingSource, setUploadingSource] = useState(null);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const response = await api.get('/sources');
      setSources(response.data);
    } catch (error) {
      toast.error('Failed to load sources');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (sourceId, file) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploadingSource(sourceId);

    try {
      // Convert to base64 for easier handling
      const reader = new FileReader();
      const base64Promise = new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result);
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const response = await api.post(`/sources/${sourceId}/header`, {
        header_image_base64: base64Data,
        header_image_filename: file.name
      });

      // Update local state
      setSources(prev => ({
        ...prev,
        [sourceId]: {
          ...prev[sourceId],
          header_image_url: response.data.header_image_url
        }
      }));

      toast.success(`Updated ${sources[sourceId]?.name || sourceId} header image`);
    } catch (error) {
      toast.error(`Failed to upload image: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploadingSource(null);
    }
  };

  const DEFAULT_SOURCES = ['optio', 'khan_academy'];

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-center mt-4">Loading sources...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">
              Manage Quest Source Images
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>How it works:</strong> Upload a default header image for each source. 
              All quests from that source will automatically use this header image unless they have their own custom image.
              This saves you from uploading the same image for every quest.
            </p>
          </div>

          <div className="grid gap-6">
            {DEFAULT_SOURCES.map(sourceId => {
              const source = sources[sourceId];
              if (!source) return null;

              return (
                <div key={sourceId} className="border rounded-lg p-6 bg-gray-50">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        {source.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Source ID: <code className="bg-gray-200 px-1 rounded">{sourceId}</code>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        id={`file-${sourceId}`}
                        accept="image/*"
                        onChange={(e) => handleImageUpload(sourceId, e.target.files[0])}
                        className="hidden"
                        disabled={uploadingSource === sourceId}
                      />
                      <label
                        htmlFor={`file-${sourceId}`}
                        className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                          uploadingSource === sourceId
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {uploadingSource === sourceId ? 'Uploading...' : 'Upload Image'}
                      </label>
                    </div>
                  </div>

                  {source.header_image_url ? (
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 mb-2">Current header image:</p>
                      <img
                        src={source.header_image_url}
                        alt={`${source.name} header`}
                        className="w-full h-48 object-cover rounded-lg border"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'block';
                        }}
                      />
                      <div className="hidden w-full h-48 bg-gray-200 rounded-lg border flex items-center justify-center">
                        <p className="text-gray-500">Image not found</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 w-full h-48 bg-gray-200 rounded-lg border-2 border-dashed border-gray-400 flex items-center justify-center">
                      <div className="text-center">
                        <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-gray-500">No header image uploaded</p>
                        <p className="text-xs text-gray-400 mt-1">Upload an image to set as default</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Custom Sources */}
            {Object.entries(sources).filter(([id]) => !DEFAULT_SOURCES.includes(id)).length > 0 && (
              <>
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Custom Sources</h3>
                </div>
                {Object.entries(sources)
                  .filter(([id]) => !DEFAULT_SOURCES.includes(id))
                  .map(([sourceId, source]) => (
                    <div key={sourceId} className="border rounded-lg p-6 bg-gray-50">
                      {/* Same UI as default sources */}
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800">
                            {source.name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Source ID: <code className="bg-gray-200 px-1 rounded">{sourceId}</code>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            id={`file-${sourceId}`}
                            accept="image/*"
                            onChange={(e) => handleImageUpload(sourceId, e.target.files[0])}
                            className="hidden"
                            disabled={uploadingSource === sourceId}
                          />
                          <label
                            htmlFor={`file-${sourceId}`}
                            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                              uploadingSource === sourceId
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            {uploadingSource === sourceId ? 'Uploading...' : 'Upload Image'}
                          </label>
                        </div>
                      </div>
                      {/* Image preview - same as above */}
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SourcesManager;