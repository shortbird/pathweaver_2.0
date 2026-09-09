import PropTypes from 'prop-types';
import { Modal } from '../ui';

const ObserverTipsModal = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tips for Observers"
      size="lg"
      bodyClassName="bg-gradient-to-br from-purple-50 via-white to-pink-50"
    >
      <div className="space-y-4 sm:space-y-6">
        {/* Philosophy Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">
            The Process Is The Goal
          </h3>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-3">
            At Optio, we believe learning is about the journey, not the destination. Instead of focusing on grades,
            test scores, or college admissions, we celebrate curiosity, effort, exploration, and growth.
          </p>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
            Students learn by doing - completing self-directed quests that align with their interests, building
            real-world skills, and creating a portfolio that showcases their unique learning path.
          </p>
        </div>

        {/* Your Role Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">Your Important Role</h3>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-4 sm:mb-5">
            As an observer, you play a vital role in encouraging the student's learning. Your support and
            celebration of their efforts - not just outcomes - helps reinforce the process-focused mindset.
          </p>

          <div className="space-y-3">
            <div className="border-l-4 border-purple-500 pl-3 sm:pl-4 py-1.5">
              <h4 className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5">
                Celebrate Effort, Not Just Results
              </h4>
              <p className="text-gray-600 text-xs sm:text-sm">
                "I love how you tried a new approach!" instead of "You're so smart!"
              </p>
            </div>

            <div className="border-l-4 border-pink-500 pl-3 sm:pl-4 py-1.5">
              <h4 className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5">
                Ask Process-Focused Questions
              </h4>
              <p className="text-gray-600 text-xs sm:text-sm">
                "What was the most challenging part?" or "What would you do differently next time?"
              </p>
            </div>

            <div className="border-l-4 border-blue-500 pl-3 sm:pl-4 py-1.5">
              <h4 className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5">Show Genuine Interest</h4>
              <p className="text-gray-600 text-xs sm:text-sm">
                "Tell me more about this project!" or "What made you choose this quest?"
              </p>
            </div>

            <div className="border-l-4 border-green-500 pl-3 sm:pl-4 py-1.5">
              <h4 className="font-semibold text-gray-900 text-sm sm:text-base mb-0.5">Acknowledge Growth</h4>
              <p className="text-gray-600 text-xs sm:text-sm">
                "I can see how much you've learned!" or "Look how far you've come!"
              </p>
            </div>
          </div>
        </div>

        {/* What You Can Do */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">What You Can Do</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-purple-50 rounded-lg p-3">
              <h4 className="font-semibold text-gray-900 text-xs sm:text-sm mb-1">View Feed</h4>
              <p className="text-gray-700 text-xs sm:text-sm">
                See their recent completions and learning moments
              </p>
            </div>

            <div className="bg-pink-50 rounded-lg p-3">
              <h4 className="font-semibold text-gray-900 text-xs sm:text-sm mb-1">Leave Comments</h4>
              <p className="text-gray-700 text-xs sm:text-sm">
                Share encouraging words and celebrate their work
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

ObserverTipsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default ObserverTipsModal;
