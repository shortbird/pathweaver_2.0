import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import api, { tokenStore } from '../../services/api';
import toast from 'react-hot-toast';
import PasswordStrengthMeter from '../auth/PasswordStrengthMeter';
import { useConfirm } from '../../contexts/ConfirmContext'

const AccountSettings = ({
  user,
  visibilityStatus,
  onUserUpdate,
  hideHeader = false
}) => {
  const confirm = useConfirm()
  const [isExpanded, setIsExpanded] = useState(hideHeader); // Auto-expand when header is hidden
  const [isEditing, setIsEditing] = useState(false);
  const [deletionRequesting, setDeletionRequesting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm({
    defaultValues: {
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      date_of_birth: user?.date_of_birth || '',
      bio: user?.bio || ''
    }
  });

  const onSubmit = async (data) => {
    try {
      const response = await api.put('/api/users/profile', data);
      if (onUserUpdate) {
        onUserUpdate(response.data);
      }
      setIsEditing(false);
      toast.success('Profile updated successfully!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update profile');
    }
  };

  // Separate form instance so the profile form's dirty state and the password
  // fields never share a submit.
  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
    reset: resetPassword,
    watch: watchPassword
  } = useForm();

  const newPassword = watchPassword('new_password', '');

  const onPasswordSubmit = async (data) => {
    setPasswordSaving(true);
    try {
      const response = await api.post('/api/auth/change-password', {
        current_password: data.current_password,
        new_password: data.new_password
      });
      // The change invalidates every token issued before it. Swap in the fresh
      // pair the endpoint hands back, or Safari/iOS (header auth, no cookies)
      // would sign itself out on the next refresh.
      const { app_access_token, app_refresh_token } = response.data || {};
      if (app_access_token && app_refresh_token) {
        await tokenStore.setTokens(app_access_token, app_refresh_token);
      }
      resetPassword();
      setIsChangingPassword(false);
      toast.success('Password updated. Other devices have been signed out.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const requestAccountDeletion = async () => {
    const confirmed = await confirm(
      'Are you sure you want to delete your account? This will:\n\n' +
      '- Schedule your account for permanent deletion in 30 days\n' +
      '- You can cancel within the 30-day grace period\n' +
      '- All your data will be permanently deleted after 30 days\n\n' +
      'This action cannot be undone after the grace period expires.'
    );

    if (!confirmed) return;

    setDeletionRequesting(true);
    try {
      await api.post('/api/users/delete-account', {
        reason: 'User requested deletion'
      });
      toast.success('Account deletion scheduled. Grace period: 30 days');
      // Refresh user data
      if (onUserUpdate) {
        const response = await api.get('/api/users/profile');
        onUserUpdate(response.data.user);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to request account deletion');
    } finally {
      setDeletionRequesting(false);
    }
  };

  const cancelAccountDeletion = async () => {
    try {
      await api.post('/api/users/cancel-deletion', {});  // send a JSON body (CSRF/Content-Type)
      toast.success('Account deletion cancelled!');
      // Refresh user data
      if (onUserUpdate) {
        const response = await api.get('/api/users/profile');
        onUserUpdate(response.data.user);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel deletion');
    }
  };

  const isDeletionPending = user?.deletion_status === 'pending';

  // Content that's shown when expanded
  const settingsContent = (
    <div className="space-y-6">
          {/* Personal Information */}
          <div className="bg-gray-50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Personal Information</h3>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-sm text-optio-purple hover:text-optio-purple-dark font-medium flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <input
                      {...register('first_name', { required: 'First name is required' })}
                      type="text"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors min-h-[44px]"
                    />
                    {errors.first_name && (
                      <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <input
                      {...register('last_name', { required: 'Last name is required' })}
                      type="text"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors min-h-[44px]"
                    />
                    {errors.last_name && (
                      <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Birthday
                  </label>
                  <input
                    {...register('date_of_birth')}
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Learning Vision
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Describe your learning goals and interests. This helps personalize AI suggestions.
                  </p>
                  <textarea
                    {...register('bio')}
                    rows={4}
                    maxLength={2000}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors resize-none"
                    placeholder="What are you excited to learn? What projects are you working on?"
                  />
                  <p className="mt-1 text-xs text-gray-400 text-right">
                    {(watch('bio') || '').length}/2000 characters
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="btn-primary min-h-[44px]"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      reset({
                        first_name: user?.first_name || '',
                        last_name: user?.last_name || '',
                        date_of_birth: user?.date_of_birth || '',
                        bio: user?.bio || ''
                      });
                    }}
                    className="btn-quiet min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="text-gray-900">{user?.first_name} {user?.last_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="text-gray-900">{user?.email}</p>
                </div>
                {user?.date_of_birth && (
                  <div>
                    <p className="text-sm text-gray-500">Birthday</p>
                    <p className="text-gray-900">
                      {new Date(`${user.date_of_birth}T00:00:00`).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {user?.bio && (
                  <div>
                    <p className="text-sm text-gray-500">Learning Vision</p>
                    <p className="text-gray-900 whitespace-pre-wrap">{user.bio}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Password */}
          <div className="bg-gray-50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Password</h3>
              {!isChangingPassword && (
                <button
                  onClick={() => setIsChangingPassword(true)}
                  className="text-sm text-optio-purple hover:text-optio-purple-dark font-medium"
                >
                  Change
                </button>
              )}
            </div>

            {isChangingPassword ? (
              <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
                <div>
                  <label htmlFor="current_password" className="block text-sm font-medium text-gray-700 mb-1">
                    Current password
                  </label>
                  <input
                    {...registerPassword('current_password', { required: 'Enter your current password' })}
                    id="current_password"
                    type="password"
                    autoComplete="current-password"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors min-h-[44px]"
                  />
                  {passwordErrors.current_password && (
                    <p className="mt-1 text-sm text-red-600">{passwordErrors.current_password.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 mb-1">
                    New password
                  </label>
                  <input
                    {...registerPassword('new_password', {
                      required: 'Enter a new password',
                      minLength: { value: 12, message: 'Password must be at least 12 characters' }
                    })}
                    id="new_password"
                    type="password"
                    autoComplete="new-password"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors min-h-[44px]"
                    placeholder="At least 12 characters"
                  />
                  {passwordErrors.new_password && (
                    <p className="mt-1 text-sm text-red-600">{passwordErrors.new_password.message}</p>
                  )}
                  <PasswordStrengthMeter password={newPassword} />
                </div>

                <div>
                  <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm new password
                  </label>
                  <input
                    {...registerPassword('confirm_password', {
                      required: 'Re-enter your new password',
                      validate: (value) => value === newPassword || 'Passwords do not match'
                    })}
                    id="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors min-h-[44px]"
                  />
                  {passwordErrors.confirm_password && (
                    <p className="mt-1 text-sm text-red-600">{passwordErrors.confirm_password.message}</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="btn-primary min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {passwordSaving ? 'Updating...' : 'Update Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingPassword(false);
                      resetPassword();
                    }}
                    className="btn-quiet min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Changing your password signs you out everywhere else. You&apos;ll stay
                  signed in here.
                </p>
                <p className="text-sm text-gray-500">
                  Signed in with Google or Apple, or don&apos;t know your current password?
                  Use{' '}
                  <a href="/forgot-password" className="text-optio-purple hover:underline font-medium">
                    Forgot password
                  </a>{' '}
                  instead.
                </p>
              </div>
            )}
          </div>

          {/* FERPA Consent Status */}
          {visibilityStatus && (
            <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Privacy Status
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Portfolio Visibility</span>
                  <span className={`font-medium ${visibilityStatus.is_public ? 'text-green-600' : 'text-gray-600'}`}>
                    {visibilityStatus.is_public ? 'Public' : 'Private'}
                  </span>
                </div>
                {visibilityStatus.consent_given_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Consent Given</span>
                    <span className="text-gray-600">
                      {new Date(visibilityStatus.consent_given_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

      {/* Danger Zone */}
      <div className="bg-red-50 rounded-xl p-6 border-2 border-red-200">
        <h3 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Danger Zone
        </h3>

        {isDeletionPending ? (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
              <p className="font-semibold text-yellow-900 mb-1">
                Account deletion scheduled
              </p>
              <p className="text-sm text-yellow-800">
                Your account will be permanently deleted on{' '}
                <strong>{new Date(user?.deletion_scheduled_for).toLocaleDateString()}</strong>
              </p>
            </div>
            <button
              onClick={cancelAccountDeletion}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors min-h-[44px]"
            >
              Cancel Deletion
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Permanently delete your account and all associated data. You will have a 30-day grace period to cancel.
            </p>
            <button
              onClick={requestAccountDeletion}
              disabled={deletionRequesting}
              className={`w-full px-4 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors min-h-[44px] ${deletionRequesting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {deletionRequesting ? 'Processing...' : 'Delete My Account'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // When header is hidden, just show the content
  if (hideHeader) {
    return settingsContent;
  }

  return (
    <section className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900">
            Account Settings
          </h2>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="px-6 pb-6">
          {settingsContent}
        </div>
      )}
    </section>
  );
};

AccountSettings.propTypes = {
  user: PropTypes.shape({
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    email: PropTypes.string,
    bio: PropTypes.string,
    deletion_status: PropTypes.string,
    deletion_scheduled_for: PropTypes.string
  }),
  visibilityStatus: PropTypes.shape({
    is_public: PropTypes.bool,
    consent_given_at: PropTypes.string
  }),
  onUserUpdate: PropTypes.func
};

export default AccountSettings;
