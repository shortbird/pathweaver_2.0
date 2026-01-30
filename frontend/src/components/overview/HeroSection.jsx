import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

// Rhythm indicator colors and labels
const RHYTHM_CONFIG = {
  in_flow: { label: 'In Flow', color: 'bg-green-500', textColor: 'text-green-700', bgColor: 'bg-green-100' },
  building: { label: 'Building', color: 'bg-yellow-500', textColor: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  resting: { label: 'Resting', color: 'bg-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-100' }
};

const HeroSection = ({
  user,
  memberSince,
  rhythm,
  totalXp,
  completedQuestsCount,
  completedTasksCount,
  onEditProfile,
  viewMode = 'student' // 'student' or 'parent'
}) => {
  const navigate = useNavigate();
  const showEditButton = viewMode !== 'parent' && onEditProfile;

  // Get user initials for avatar
  const initials = `${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`.toUpperCase();

  // Format member since date
  const formattedMemberSince = memberSince
    ? new Date(memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  // Get rhythm config
  const rhythmConfig = rhythm ? RHYTHM_CONFIG[rhythm] : null;

  return (
    <section className="bg-gradient-to-r from-optio-purple to-optio-pink text-white py-8 sm:py-12 px-6 rounded-2xl shadow-lg">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          {/* Avatar Circle with Image or Initials */}
          <div className="w-20 sm:w-24 h-20 sm:h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-lg flex-shrink-0 overflow-hidden">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={`${user.first_name}'s profile`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-3xl sm:text-4xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                {initials || '?'}
              </span>
            )}
          </div>

          {/* User Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                {user?.first_name} {user?.last_name}
              </h1>
              {/* Rhythm Indicator Badge */}
              {rhythmConfig && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${rhythmConfig.bgColor} ${rhythmConfig.textColor}`}>
                  <span className={`w-2 h-2 rounded-full ${rhythmConfig.color}`}></span>
                  {rhythmConfig.label}
                </span>
              )}
            </div>
            {formattedMemberSince && (
              <p className="text-white/90 text-sm sm:text-base md:text-lg mt-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Learning since {formattedMemberSince}
              </p>
            )}
          </div>

          {/* Edit Profile Button - hidden in parent view */}
          {showEditButton && (
            <button
              onClick={onEditProfile}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-colors min-h-[44px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit Profile
            </button>
          )}
        </div>

        {/* Quick Stats Row */}
        <div className="mt-6 sm:mt-8 grid grid-cols-3 gap-4 sm:gap-6 max-w-lg mx-auto">
          {/* Total XP */}
          <div className="text-center">
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              {totalXp?.toLocaleString() || 0}
            </div>
            <div className="text-white/80 text-xs sm:text-sm uppercase tracking-wide mt-1">
              Total XP
            </div>
          </div>

          {/* Quests Completed */}
          <div className="text-center border-l border-white/20">
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              {completedQuestsCount || 0}
            </div>
            <div className="text-white/80 text-xs sm:text-sm uppercase tracking-wide mt-1">
              Quests
            </div>
          </div>

          {/* Tasks Completed */}
          <div className="text-center border-l border-white/20">
            <div className="text-2xl sm:text-3xl md:text-4xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              {completedTasksCount || 0}
            </div>
            <div className="text-white/80 text-xs sm:text-sm uppercase tracking-wide mt-1">
              Completed Tasks
            </div>
          </div>
        </div>

        {/* Mobile Edit Profile Button - hidden in parent view */}
        {showEditButton && (
          <button
            onClick={onEditProfile}
            className="sm:hidden mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-colors min-h-[44px]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Edit Profile
          </button>
        )}
      </div>
    </section>
  );
};

HeroSection.propTypes = {
  user: PropTypes.shape({
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    avatar_url: PropTypes.string
  }),
  memberSince: PropTypes.string,
  rhythm: PropTypes.oneOf(['in_flow', 'building', 'resting']),
  totalXp: PropTypes.number,
  completedQuestsCount: PropTypes.number,
  completedTasksCount: PropTypes.number,
  onEditProfile: PropTypes.func,
  viewMode: PropTypes.oneOf(['student', 'parent'])
};

export default HeroSection;
