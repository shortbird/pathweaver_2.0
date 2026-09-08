import React from 'react';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { Modal } from '../ui';

const InfoModal = ({ isOpen, onClose, title, children, actionText = "Got It", onAction }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex justify-end">
          <button
            onClick={onAction || onClose}
            className="px-6 py-3 bg-gradient-primary text-white font-semibold rounded-lg hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2"
          >
            {actionText}
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      }
      footerClassName="bg-gray-50"
    >
      {children}
    </Modal>
  );
};

export default InfoModal;
