import { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert, FormField, FormFooter } from '../ui';
import api from '../../services/api';

/**
 * Add a child to the family — one form for both ages.
 *
 * Replaced the old pair of buttons ("Create Child Profile (Under 13)" and
 * "Connect to Existing Student (13+)"), which asked parents to know Optio's
 * account model before they could add their own kid — and left the 13+ case
 * dependent on the teen signing themselves up. Date of birth decides:
 *   under 13 -> managed child profile, no email
 *   13+      -> the teen's own account, created by the parent, verification
 *               email sent to the teen
 * The backend (/api/dependents/add-child) enforces the same split.
 */
const AddChildModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    email: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Set when the account was created but its set-password email didn't send.
  // The modal stays open on this: closing on a silent failure would leave the
  // parent believing their teen was emailed a link that never went out.
  const [undelivered, setUndelivered] = useState(null);
  const [resendState, setResendState] = useState('idle'); // idle | sending | sent | failed

  const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) return null;
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const age = calculateAge(formData.date_of_birth);
  const isTeen = age !== null && age >= 13;
  const firstName = formData.first_name.trim() || 'your child';

  const reset = () => {
    setFormData({ first_name: '', last_name: '', date_of_birth: '', email: '' });
    setError('');
    setUndelivered(null);
    setResendState('idle');
  };

  const handleResend = async () => {
    if (!undelivered) return;
    setResendState('sending');
    try {
      await api.post(`/api/dependents/${undelivered.id}/resend-invite`, {});
      setResendState('sent');
    } catch {
      setResendState('failed');
    }
  };

  // Finish after an undelivered invite: the account exists, so the dashboard
  // still needs to refresh.
  const handleDone = () => {
    const done = undelivered;
    reset();
    onClose();
    if (done) onSuccess({ message: `${done.first_name} was added.`, kind: 'student' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.first_name.trim()) return setError('First name is required');
    if (!formData.last_name.trim()) return setError('Last name is required');
    if (!formData.date_of_birth) return setError('Date of birth is required');
    if (age !== null && age < 0) return setError('Date of birth cannot be in the future');
    if (isTeen) {
      if (!formData.email.trim()) {
        return setError(`An email address is required for students 13 and older — it's how ${firstName} signs in.`);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        return setError('Please enter a valid email address');
      }
    }

    setIsSubmitting(true);
    try {
      const { data } = await api.post('/api/dependents/add-child', {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        date_of_birth: formData.date_of_birth,
        email: isTeen ? formData.email.trim() : undefined
      });
      if (data.kind === 'student' && data.invite_sent === false) {
        // Created, but nothing was emailed. Hold the modal open with a retry
        // rather than reporting success the teen can't act on.
        setUndelivered({
          id: data.student.id,
          email: data.student.email,
          first_name: data.student.first_name || formData.first_name.trim()
        });
        return;
      }
      onSuccess({ message: data.message, kind: data.kind, student: data.student, dependent: data.dependent });
      reset();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add child. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    if (undelivered) return handleDone();
    reset();
    onClose();
  };

  if (undelivered) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleDone}
        title="Account created — email not sent"
        size="sm"
      >
        <div className="space-y-4">
          <Alert variant="warning">
            <p className="mb-2">
              <strong>{undelivered.first_name}&apos;s account is ready</strong>, but we
              couldn&apos;t send the set-password email to {undelivered.email} just now.
            </p>
            <p>
              They can&apos;t sign in until they get it. Try sending it again — or use
              &quot;Forgot password&quot; on the login page with that address.
            </p>
          </Alert>

          {resendState === 'sent' && (
            <Alert variant="success">
              Sent. Ask {undelivered.first_name} to check their inbox and spam folder.
            </Alert>
          )}
          {resendState === 'failed' && (
            <Alert variant="error">
              Still couldn&apos;t send it. Check the address, or try again in a few minutes.
            </Alert>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendState === 'sending' || resendState === 'sent'}
              className="flex-1 btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {resendState === 'sending' ? 'Sending…'
                : resendState === 'sent' ? 'Email sent'
                : 'Send it again'}
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add a Child"
      size="sm"
      showCloseButton={!isSubmitting}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="First Name"
          required
          inputProps={{
            id: 'first_name',
            value: formData.first_name,
            onChange: (e) => setFormData({ ...formData, first_name: e.target.value }),
            placeholder: 'e.g., Alex',
            disabled: isSubmitting
          }}
        />

        <FormField
          label="Last Name"
          required
          inputProps={{
            id: 'last_name',
            value: formData.last_name,
            onChange: (e) => setFormData({ ...formData, last_name: e.target.value }),
            placeholder: 'e.g., Smith',
            disabled: isSubmitting
          }}
        />

        <FormField
          label="Date of Birth"
          required
          type="text"
          inputProps={{
            id: 'date_of_birth',
            type: 'date',
            value: formData.date_of_birth,
            onChange: (e) => setFormData({ ...formData, date_of_birth: e.target.value }),
            max: new Date().toISOString().split('T')[0],
            disabled: isSubmitting
          }}
        />

        {/* Email appears only once the birth date says it's needed, so the form
            never asks a parent of a 7-year-old for their child's email. */}
        {isTeen && (
          <FormField
            label="Their Email Address"
            required
            inputProps={{
              id: 'email',
              type: 'email',
              value: formData.email,
              onChange: (e) => setFormData({ ...formData, email: e.target.value }),
              placeholder: 'e.g., alex@example.com',
              disabled: isSubmitting
            }}
          />
        )}

        {/* What will happen, in the parent's terms — shown only once we know. */}
        {age !== null && age >= 0 && (
          <Alert variant="info">
            {isTeen ? (
              <p>
                <strong>Age {age}:</strong> {firstName} gets their own account. We&apos;ll email
                them a link to choose a password and sign in, and their work will show on
                your dashboard.
              </p>
            ) : (
              <p>
                <strong>Age {age}:</strong> you&apos;ll manage {firstName}&apos;s profile
                completely — no email or password needed. They can get their own login at 13.
              </p>
            )}
          </Alert>
        )}

        {error && <Alert variant="error">{error}</Alert>}

        <FormFooter
          onCancel={handleClose}
          cancelText="Cancel"
          submitText="Add Child"
          isSubmitting={isSubmitting}
          disabled={isSubmitting}
        />
      </form>
    </Modal>
  );
};

AddChildModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired
};

export default AddChildModal;
