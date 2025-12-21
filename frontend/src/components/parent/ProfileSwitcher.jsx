import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { ChevronDownIcon, UserCircleIcon, PlusIcon } from '@heroicons/react/24/outline';
import { getMyDependents } from '../../services/dependentAPI';

const ProfileSwitcher = ({ currentProfile, onProfileChange, onAddDependent }) => {
  const [profiles, setProfiles] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDependents();
  }, []);

  const loadDependents = async () => {
    try {
      setLoading(true);
      const response = await getMyDependents();

      // Build profiles array: [parent, ...dependents]
      const dependentProfiles = (response.dependents || []).map(dep => ({
        id: dep.id,
        display_name: dep.display_name,
        avatar_url: dep.avatar_url,
        age: dep.age,
        is_dependent: true,
        total_xp: dep.total_xp,
        active_quest_count: dep.active_quest_count,
        promotion_eligible: dep.promotion_eligible
      }));

      setProfiles(dependentProfiles);
      setError(null);
    } catch (err) {
      console.error('Error loading dependents:', err);
      // Don't show error if parent simply has no dependents or lacks permission
      // Just set empty profiles array
      setProfiles([]);
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSelect = (profile) => {
    onProfileChange(profile);
    setIsOpen(false);
  };

  const handleAddDependent = () => {
    setIsOpen(false);
    onAddDependent();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && !event.target.closest('.profile-switcher')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm">
        <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
        <div className="w-24 h-4 bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="profile-switcher relative">
      {/* Current Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200"
      >
        {/* Avatar */}
        {currentProfile?.avatar_url ? (
          <img
            src={currentProfile.avatar_url}
            alt={currentProfile.display_name}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <UserCircleIcon className="w-8 h-8 text-gray-400" />
        )}

        {/* Profile Name */}
        <div className="text-left">
          <div className="text-xs text-gray-500">Acting as:</div>
          <div className="font-medium text-gray-900">
            {currentProfile?.display_name || 'Select Profile'}
            {currentProfile?.is_dependent && currentProfile?.age && (
              <span className="text-xs text-gray-500 ml-2">(Age {currentProfile.age})</span>
            )}
          </div>
        </div>

        {/* Dropdown Icon */}
        <ChevronDownIcon
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full min-w-[280px] bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          {/* Parent Profile (Self) */}
          {!currentProfile?.is_dependent && (
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Your Profile</div>
              <div className="flex items-center gap-2">
                {currentProfile?.avatar_url ? (
                  <img
                    src={currentProfile.avatar_url}
                    alt={currentProfile.display_name}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <UserCircleIcon className="w-6 h-6 text-gray-400" />
                )}
                <span className="font-medium text-gray-900">{currentProfile?.display_name || 'You'}</span>
                <span className="ml-auto text-xs bg-optio-purple text-white px-2 py-1 rounded">Current</span>
              </div>
            </div>
          )}

          {/* Dependent Profiles */}
          {profiles.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Dependents
              </div>
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleProfileSelect(profile)}
                  className={`w-full px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                    currentProfile?.id === profile.id ? 'bg-purple-50' : ''
                  }`}
                >
                  {/* Avatar */}
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <UserCircleIcon className="w-8 h-8 text-gray-400" />
                  )}

                  {/* Profile Info */}
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900">
                      {profile.display_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      Age {profile.age} • {profile.total_xp || 0} XP • {profile.active_quest_count || 0} active quests
                    </div>
                    {profile.promotion_eligible && (
                      <div className="text-xs text-green-600 font-medium mt-1">
                        Eligible for independent account
                      </div>
                    )}
                  </div>

                  {/* Current Indicator */}
                  {currentProfile?.id === profile.id && (
                    <span className="text-xs bg-optio-purple text-white px-2 py-1 rounded">Current</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Add Child Profile Button */}
          <div className="border-t border-gray-200">
            <button
              onClick={handleAddDependent}
              className="w-full px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 text-optio-purple font-medium"
            >
              <PlusIcon className="w-5 h-5" />
              <span>Add Child Profile</span>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-4 py-3 bg-red-50 border-t border-red-200 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

ProfileSwitcher.propTypes = {
  currentProfile: PropTypes.shape({
    id: PropTypes.string,
    display_name: PropTypes.string,
    avatar_url: PropTypes.string,
    age: PropTypes.number,
    is_dependent: PropTypes.bool,
    total_xp: PropTypes.number,
    active_quest_count: PropTypes.number,
    promotion_eligible: PropTypes.bool
  }),
  onProfileChange: PropTypes.func.isRequired,
  onAddDependent: PropTypes.func.isRequired
};

export default ProfileSwitcher;
