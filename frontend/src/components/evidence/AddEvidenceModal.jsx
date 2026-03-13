import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import EvidenceContentEditor from './EvidenceContentEditor';

/**
 * AddEvidenceModal - Standard evidence upload modal used across the platform.
 * Wraps EvidenceContentEditor in a Dialog for modal presentation.
 *
 * For students: used in TaskWorkspace with onSave/onUpdate callbacks.
 * For parents: used in ParentQuestView with helper evidence submission.
 * For advisors: the advisor flow uses EvidenceContentEditor directly.
 */
const AddEvidenceModal = ({ isOpen, onClose, onSave, onUpdate, editingBlock = null, existingEvidence = [] }) => {
  const isEditMode = !!editingBlock;

  const handleClose = () => {
    onClose();
  };

  const handleSave = (items) => {
    onSave(items);
    handleClose();
  };

  const handleUpdate = (item) => {
    onUpdate?.(item);
    handleClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 z-50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto z-50">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-full sm:max-w-2xl mx-2 sm:mx-0 bg-white rounded-2xl shadow-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <Dialog.Title className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>
                    {isEditMode ? 'Edit Evidence' : 'Add Evidence'}
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Content + Footer from EvidenceContentEditor */}
                <EvidenceContentEditor
                  onSave={handleSave}
                  onCancel={handleClose}
                  onUpdate={handleUpdate}
                  editingBlock={editingBlock}
                  existingEvidence={existingEvidence}
                />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AddEvidenceModal;
