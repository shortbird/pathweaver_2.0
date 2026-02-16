import React from 'react';
import PropTypes from 'prop-types';

const HeroSection = ({
  user,
  memberSince,
  totalXp,
  completedQuestsCount,
  completedTasksCount,
  onEditProfile,
  viewMode = 'student' // 'student' or 'parent'
}) => {
  const showEditButton = viewMode !== 'parent' && onEditProfile;

  // Get user initials for avatar
  const initials = `${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`.toUpperCase();

  // Format member since date
  const formattedMemberSince = memberSince
    ? new Date(memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return (
    <section className="relative bg-gradient-to-r from-optio-purple to-optio-pink text-white py-8 sm:py-12 px-6 rounded-2xl shadow-lg">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          {/* Avatar Circle with Image or Initials */}
          <div className={`w-20 sm:w-24 h-20 sm:h-24 rounded-full flex items-center justify-center border-2 shadow-lg flex-shrink-0 overflow-hidden ${user?.avatar_url ? 'border-white/30' : 'bg-purple-200/60 border-white/30'}`}>
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={`${user.first_name}'s profile`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                {initials || '?'}
              </span>
            )}
          </div>

          {/* User Info */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              {user?.first_name} {user?.last_name}
            </h1>
            {formattedMemberSince && (
              <p className="text-white/90 text-sm sm:text-base md:text-lg mt-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Learning since {formattedMemberSince}
              </p>
            )}
          </div>

        </div>

        {/* Quick Stats Row - hidden if no activity yet */}
        {(totalXp > 0 || completedQuestsCount > 0 || completedTasksCount > 0) && (
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
        )}
      </div>

      {/* Edit Profile Button - positioned bottom right like View Full Portfolio */}
      {showEditButton && (
        <button
          onClick={onEditProfile}
          className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-sm border border-white/20 text-gray-700 rounded-lg text-sm font-medium hover:bg-white hover:shadow-md transition-all min-h-[40px]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Edit Profile
        </button>
      )}
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
  totalXp: PropTypes.number,
  completedQuestsCount: PropTypes.number,
  completedTasksCount: PropTypes.number,
  onEditProfile: PropTypes.func,
  viewMode: PropTypes.oneOf(['student', 'parent'])
};

export default HeroSection;
