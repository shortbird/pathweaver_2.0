import React from 'react';
import { UsersIcon, HeartIcon, StarIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/outline';

const FamilyEngagementPreview = () => {
  const observerComments = [
    {
      id: 1,
      name: 'Grandma Rosa',
      avatar: '👵',
      role: 'Grandparent',
      comment: "So proud you're preserving our family recipes! That story about the Depression-era cooking brought tears to my eyes. Love you! ❤️",
      timeAgo: '2 hours ago',
      reactions: ['❤️', '🎉']
    },
    {
      id: 2,
      name: 'Mr. Chen',
      avatar: '👨‍🏫',
      role: 'Mentor',
      comment: "Your interview technique shows real growth in your communication skills! The follow-up questions you asked were excellent. 🌟",
      timeAgo: 'Yesterday',
      reactions: ['⭐', '💡']
    }
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <UsersIcon className="w-8 h-8 text-optio-purple" />
          <h2 className="text-3xl font-bold text-text-primary">
            Your Learning Community
          </h2>
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Grandparents, mentors, and family can celebrate with you
        </p>
      </div>

      {/* Who Can Be Observers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {[
          { emoji: '👵', label: 'Grandparents' },
          { emoji: '👨‍🏫', label: 'Mentors' },
          { emoji: '👨‍👩‍👧', label: 'Extended Family' },
          { emoji: '🎓', label: 'Advisors' }
        ].map((observer, index) => (
          <div
            key={index}
            className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border-2 border-purple-100 text-center"
          >
            <div className="text-4xl mb-2">{observer.emoji}</div>
            <p className="text-sm font-semibold text-gray-700">{observer.label}</p>
          </div>
        ))}
      </div>

      {/* Activity Feed Simulation */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-xl overflow-hidden max-w-3xl mx-auto">
        {/* Feed Header */}
        <div className="bg-gradient-primary text-white px-6 py-4">
          <div className="flex items-center gap-2">
            <ChatBubbleLeftIcon className="w-5 h-5" />
            <h3 className="font-bold">Family Activity Feed</h3>
          </div>
        </div>

        {/* Comments */}
        <div className="divide-y divide-gray-200">
          {observerComments.map((comment) => (
            <div key={comment.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center text-2xl">
                    {comment.avatar}
                  </div>
                </div>

                {/* Comment Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h4 className="font-semibold text-gray-800">{comment.name}</h4>
                    <span className="text-xs text-gray-500">{comment.role}</span>
                    <span className="text-xs text-gray-400">• {comment.timeAgo}</span>
                  </div>

                  <p className="text-gray-700 leading-relaxed mb-3">
                    {comment.comment}
                  </p>

                  {/* Reactions */}
                  <div className="flex items-center gap-2">
                    {comment.reactions.map((reaction, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors cursor-pointer"
                      >
                        {reaction}
                      </span>
                    ))}
                    <button className="text-sm text-gray-500 hover:text-optio-purple transition-colors ml-2">
                      Reply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Comment Prompt */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center text-lg">
              👤
            </div>
            <div className="flex-1 bg-white rounded-full px-4 py-2 text-sm text-gray-500 border border-gray-200">
              Share encouragement...
            </div>
            <button className="px-4 py-2 bg-gradient-primary text-white rounded-full text-sm font-semibold hover:shadow-lg transition-all">
              Post
            </button>
          </div>
        </div>
      </div>

      {/* Key Benefits */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6 text-center">
          <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-3">
            <HeartIcon className="w-6 h-6 text-white" />
          </div>
          <h4 className="font-semibold text-gray-800 mb-2">
            Process Celebration
          </h4>
          <p className="text-sm text-gray-700">
            Family celebrates your journey, not just outcomes
          </p>
        </div>

        <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6 text-center">
          <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-3">
            <StarIcon className="w-6 h-6 text-white" />
          </div>
          <h4 className="font-semibold text-gray-800 mb-2">
            Meaningful Feedback
          </h4>
          <p className="text-sm text-gray-700">
            Real encouragement from people who know you
          </p>
        </div>

        <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6 text-center">
          <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-3">
            <UsersIcon className="w-6 h-6 text-white" />
          </div>
          <h4 className="font-semibold text-gray-800 mb-2">
            Shared Experience
          </h4>
          <p className="text-sm text-gray-700">
            Transform learning into a family journey
          </p>
        </div>
      </div>

      {/* Philosophy Message */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6 max-w-3xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-gray-700 font-semibold">
            🌍 Transform learning into a shared family experience
          </p>
          <p className="text-sm text-gray-600 italic">
            When your whole family can cheer you on, learning becomes a celebration.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FamilyEngagementPreview;
