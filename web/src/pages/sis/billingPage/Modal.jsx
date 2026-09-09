/**
 * Extracted from sis/BillingPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import ModalOverlay from '../../../components/ui/ModalOverlay'

const Modal = ({ title, onClose, children }) => (
  <ModalOverlay onClose={onClose}>
    <div
      className="w-full max-w-md max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl bg-white p-6 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h3 className="font-semibold text-neutral-900">{title}</h3>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-lg" aria-label="Close">×</button>
      </div>
      <div className="modal-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  </ModalOverlay>
)

// Sort preference per view. localStorage so the office's choice survives a
// page load — the dropdown existed before this and still reset every visit,
// which read as the sort not working at all.

export default Modal
