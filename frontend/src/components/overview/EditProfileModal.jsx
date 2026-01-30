import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import api from '../../services/api';
import toast from 'react-hot-toast';

const EditProfileModal = ({ isOpen, onClose, user, onUserUpdate }) => {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(user?.avatar_url || null);
  const fileInputRef = useRef(null);

  const { register, handleSubmit, formState: { errors, isSubmitting }, watch, reset } = useForm({
    defaultValues: {
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      bio: user?.bio || ''
    }
  });

  // Sync preview and form when modal opens or user changes
  useEffect(() => {
    if (isOpen && user) {
      setPreviewUrl(user.avatar_url || null);
      reset({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        bio: user.bio || ''
      });
    }
  }, [isOpen, user, reset]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target.result);
    reader.readAsDataURL(file);

    // Upload to server
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await api.post('/api/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data?.avatar_url) {
        setPreviewUrl(response.data.avatar_url);
        if (onUserUpdate) {
          onUserUpdate({ ...user, avatar_url: response.data.avatar_url });
        }
        toast.success('Profile picture updated!');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to upload image');
      setPreviewUrl(user?.avatar_url || null);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data) => {
    try {
      const response = await api.put('/api/users/profile', data);
      if (onUserUpdate) {
        onUserUpdate(response.data);
      }
      toast.success('Profile updated!');
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update profile');
    }
  };

  if (!isOpen) return null;

  const initials = `${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 transform transition-all">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <h2 className="text-xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Edit Profile
          </h2>

          {/* Avatar Upload */}
          <div className="flex justify-center mb-6">
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={uploading}
              className="relative group"
            >
              <div className="w-24 h-24 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center text-white font-bold text-2xl overflow-hidden">
                {previewUrl ? (
                  <img src={previewUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  initials || '?'
                )}
              </div>
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </button>
          </div>
          <p className="text-center text-sm text-gray-500 mb-6">Click to upload a profile picture</p>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  {...register('first_name', { required: 'Required' })}
                  type="text"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors"
                />
                {errors.first_name && (
                  <p className="mt-1 text-xs text-red-600">{errors.first_name.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  {...register('last_name', { required: 'Required' })}
                  type="text"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors"
                />
                {errors.last_name && (
                  <p className="mt-1 text-xs text-red-600">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bio
              </label>
              <textarea
                {...register('bio')}
                rows={3}
                maxLength={500}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors resize-none"
                placeholder="Tell us about yourself..."
              />
              <p className="mt-1 text-xs text-gray-400 text-right">
                {(watch('bio') || '').length}/500
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:shadow-md transition-shadow disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

EditProfileModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  user: PropTypes.shape({
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    bio: PropTypes.string,
    avatar_url: PropTypes.string
  }),
  onUserUpdate: PropTypes.func
};

export default EditProfileModal;
