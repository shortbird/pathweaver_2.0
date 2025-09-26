import React from 'react';
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserGroupIcon,
  SparklesIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

const CollaborationBadge = ({ status, showXpBonus = false, className = '' }) => {
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
      icon: UserGroupIcon,
      label: 'Team Active'
    },
    declined: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      icon: XCircleIcon,
      label: 'Declined'
    },
    cancelled: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      icon: XCircleIcon,
      label: 'Cancelled'
    },
    completed: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      icon: CheckCircleIcon,
      label: 'Completed'
    },
    expired: {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      icon: ExclamationCircleIcon,
      label: 'Expired'
    }
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  if (showXpBonus && status === 'accepted') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800 border border-purple-200 ${className}`}
      >
        <SparklesIcon className="w-3 h-3" />
        2x XP Active
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className}`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

export default CollaborationBadge;