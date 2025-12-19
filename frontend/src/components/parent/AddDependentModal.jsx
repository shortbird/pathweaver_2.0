import { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert, FormField, FormFooter } from '../ui';
import { createDependent } from '../../services/dependentAPI';

const AddDependentModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ageWarning, setAgeWarning] = useState('');

  const calculateAge = (birthDate) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  };

  const handleDateChange = (dateStr) => {
    setFormData({ ...formData, date_of_birth: dateStr });

    // Validate age
    if (dateStr) {
      const age = calculateAge(dateStr);

      if (age >= 13) {
        setAgeWarning(
          `Child is ${age} years old. Dependent profiles are for children under 13. ` +
          'For teens 13+, use "Connect to Existing Student" instead.'
        );
      } else if (age < 5) {
        setAgeWarning(
          `Child is ${age} years old. This feature is designed for children ages 5-12.`
        );
      } else {
        setAgeWarning('');
      }
    } else {
      setAgeWarning('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate required fields
    if (!formData.first_name.trim()) {
      setError('First name is required');
      return;
    }

    if (!formData.last_name.trim()) {
      setError('Last name is required');
      return;
    }

    if (!formData.date_of_birth) {
      setError('Date of birth is required');
      return;
    }

    // Validate age
    const age = calculateAge(formData.date_of_birth);
    if (age >= 13) {
      setError(
        `Child must be under 13 years old (currently ${age}). ` +
        'For teens 13+, use "Connect to Existing Student" instead.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const displayName = `${formData.first_name.trim()} ${formData.last_name.trim()}`;
      const response = await createDependent({
        display_name: displayName,
        date_of_birth: formData.date_of_birth,
        avatar_url: null
      });

      // Success
      onSuccess({
        message: response.message || `Dependent profile created for ${displayName}`,
        dependent: response.dependent
      });

      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        date_of_birth: ''
      });
      setAgeWarning('');
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create dependent profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        first_name: '',
        last_name: '',
        date_of_birth: ''
      });
      setError('');
      setAgeWarning('');
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Child Profile"
      size="sm"
      showCloseButton={!isSubmitting}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Explanation Notice */}
        <Alert variant="info">
          <p className="mb-2">
            <strong>Under 13:</strong> Fill out the form below to create a dependent profile. You'll manage their account fully with no email/password required.
          </p>
          <p>
            <strong>13+ with existing account:</strong> Email <a href="mailto:support@optioeducation.com" className="underline font-semibold">support@optioeducation.com</a> to request a connection. The student maintains control of their account.
          </p>
        </Alert>

        {/* First Name */}
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

        {/* Last Name */}
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

        {/* Date of Birth */}
        <FormField
          label="Date of Birth"
          required
          type="text"
          inputProps={{
            id: 'date_of_birth',
            type: 'date',
            value: formData.date_of_birth,
            onChange: (e) => handleDateChange(e.target.value),
            max: new Date().toISOString().split('T')[0],
            disabled: isSubmitting
          }}
        />

        {/* Age Warning */}
        {ageWarning && (
          <Alert variant="warning">
            {ageWarning}
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="error">
            {error}
          </Alert>
        )}

        {/* Buttons */}
        <FormFooter
          onCancel={handleClose}
          cancelText="Cancel"
          submitText="Create Profile"
          isSubmitting={isSubmitting}
          disabled={isSubmitting || !!ageWarning}
        />
      </form>
    </Modal>
  );
};

AddDependentModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired
};

export default AddDependentModal;
