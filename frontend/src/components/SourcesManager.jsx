import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Upload, Image, X } from 'lucide-react';

const SourcesManager = ({ onClose }) => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingSource, setUploadingSource] = useState(null);
  const [showNewSourceForm, setShowNewSourceForm] = useState(false);
  const [newSource, setNewSource] = useState({ id: '', name: '' });

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const response = await api.get('/v3/admin/quest-sources');
      // Convert array to object format for easier access
      const sourcesArray = response.data.sources || [];
      setSources(sourcesArray);
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

      const response = await api.put(`/v3/admin/quest-sources/${sourceId}`, {
        header_image_base64: base64Data
      });

      // Update local state
      setSources(prev => prev.map(source => 
        source.id === sourceId 
          ? { ...source, header_image_url: response.data.source.header_image_url }
          : source
      ));

      const sourceName = sources.find(s => s.id === sourceId)?.name || sourceId;
      toast.success(`Updated ${sourceName} header image`);
    } catch (error) {
      toast.error(`Failed to upload image: ${error.response?.data?.error || error.message}`);
    } finally {
      setUploadingSource(null);
    }
  };

  const handleCreateSource = async () => {
    if (!newSource.id || !newSource.name) {
      toast.error('Source ID and name are required');
      return;
    }

    try {
      const response = await api.post('/v3/admin/quest-sources', {
        id: newSource.id.toLowerCase().replace(/\s+/g, '_'),
        name: newSource.name
      });

      toast.success('Source created successfully');
      setSources([...sources, response.data.source]);
      setShowNewSourceForm(false);
      setNewSource({ id: '', name: '' });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create source');
    }
  };

  // Priority sources to show first
  const PRIORITY_SOURCES = ['optio', 'khan_academy', 'admin', 'student_submitted'];

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

          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Quest Sources</h3>
            {!showNewSourceForm && (
              <button
                onClick={() => setShowNewSourceForm(true)}
                className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 flex items-center gap-2"
              >
                <Plus size={20} />
                Add New Source
              </button>
            )}
          </div>

          {showNewSourceForm && (
            <div className="border rounded-lg p-4 mb-6 bg-gray-50">
              <h4 className="font-semibold mb-3">Create New Source</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Source ID</label>
                  <input
                    type="text"
                    placeholder="e.g., coursera"
                    value={newSource.id}
                    onChange={(e) => setNewSource({ ...newSource, id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <p className="text-xs text-gray-500 mt-1">Lowercase, no spaces</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Coursera"
                    value={newSource.name}
                    onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleCreateSource}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Create Source
                </button>
                <button
                  onClick={() => {
                    setShowNewSourceForm(false);
                    setNewSource({ id: '', name: '' });
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-6">
            {/* Priority sources first */}
            {sources
              .filter(source => PRIORITY_SOURCES.includes(source.id))
              .sort((a, b) => PRIORITY_SOURCES.indexOf(a.id) - PRIORITY_SOURCES.indexOf(b.id))
              .map(source => {

              return (
                <div key={source.id} className="border rounded-lg p-6 bg-gray-50">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        {source.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Source ID: <code className="bg-gray-200 px-1 rounded">{source.id}</code>
                      </p>
                      {source.quest_count > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Used by {source.quest_count} quest{source.quest_count !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        id={`file-${source.id}`}
                        accept="image/*"
                        onChange={(e) => handleImageUpload(source.id, e.target.files[0])}
                        className="hidden"
                        disabled={uploadingSource === source.id}
                      />
                      <label
                        htmlFor={`file-${source.id}`}
                        className={`px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2 ${
                          uploadingSource === source.id
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:opacity-90'
                        }`}
                      >
                        <Upload size={18} />
                        {uploadingSource === source.id ? 'Uploading...' : 'Upload Image'}
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
                        <Image size={48} className="text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">No header image uploaded</p>
                        <p className="text-xs text-gray-400 mt-1">Upload an image to set as default</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Other Sources */}
            {sources.filter(source => !PRIORITY_SOURCES.includes(source.id)).length > 0 && (
              <>
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Other Sources</h3>
                </div>
                {sources
                  .filter(source => !PRIORITY_SOURCES.includes(source.id))
                  .map(source => (
                    <div key={source.id} className="border rounded-lg p-6 bg-gray-50">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800">
                            {source.name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Source ID: <code className="bg-gray-200 px-1 rounded">{source.id}</code>
                          </p>
                          {source.quest_count > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              Used by {source.quest_count} quest{source.quest_count !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            id={`file-${source.id}`}
                            accept="image/*"
                            onChange={(e) => handleImageUpload(source.id, e.target.files[0])}
                            className="hidden"
                            disabled={uploadingSource === source.id}
                          />
                          <label
                            htmlFor={`file-${source.id}`}
                            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2 ${
                              uploadingSource === source.id
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:opacity-90'
                            }`}
                          >
                            <Upload size={18} />
                            {uploadingSource === source.id ? 'Uploading...' : 'Upload Image'}
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
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <div className="hidden w-full h-48 bg-gray-200 rounded-lg border items-center justify-center">
                            <p className="text-gray-500">Image not found</p>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 w-full h-48 bg-gray-200 rounded-lg border-2 border-dashed border-gray-400 flex items-center justify-center">
                          <div className="text-center">
                            <Image size={48} className="text-gray-400 mx-auto mb-2" />
                            <p className="text-gray-500">No header image uploaded</p>
                            <p className="text-xs text-gray-400 mt-1">Upload an image to set as default</p>
                          </div>
                        </div>
                      )}
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