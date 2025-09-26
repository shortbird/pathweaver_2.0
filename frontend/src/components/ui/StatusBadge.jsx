import React from 'react';
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  MinusCircleIcon,
  ShieldExclamationIcon
} from '@heroicons/react/24/outline';

const StatusBadge = ({ status, className = '' }) => {
  const statusConfig = {
    pending: {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      icon: ClockIcon,
      label: 'Pending'
    },
    accepted: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      icon: CheckCircleIcon,
      label: 'Friends'
    },
    rejected: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      icon: XCircleIcon,
      label: 'Declined'
    },
    cancelled: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      icon: MinusCircleIcon,
      label: 'Cancelled'
    },
    blocked: {
      bg: 'bg-red-200',
      text: 'text-red-900',
      icon: ShieldExclamationIcon,
      label: 'Blocked'
    }
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

export default StatusBadge;