import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';

const QuestCardSimple = ({ quest }) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/quests/${quest.id}`);
  };

  return (
    <div
      className="group bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100"
      onClick={handleCardClick}
    >
      {/* Image Section with Title Overlay */}
      <div className="relative h-48 overflow-hidden">
        {/* Background Image */}
        {quest.image_url || quest.header_image_url ? (
          <img
            src={quest.image_url || quest.header_image_url}
            alt={quest.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          /* Fallback gradient if no image */
          <div className="w-full h-full bg-gradient-to-br from-[#6d469b] to-[#ef597b]" />
        )}

        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

        {/* Title Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-6">
          <h3 className="text-white text-xl font-bold leading-tight drop-shadow-lg line-clamp-2">
            {quest.title}
          </h3>
        </div>
      </div>

      {/* Description Section */}
      <div className="bg-white p-6">
        <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
          {quest.description || quest.big_idea || 'Explore this quest to learn more.'}
        </p>
      </div>
    </div>
  );
};

export default memo(QuestCardSimple);
