import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { useFamilyScope } from '../../contexts/FamilyScopeContext';

/**
 * The family scope switcher: which child the parent is working FOR.
 *
 * Lives in the Sidebar (and the TopNavbar at narrow widths). Picking a child
 * enters family scope (contexts/FamilyScopeContext): the child's own pages
 * -- dashboard, quests, journal, portfolio -- render pointed at that child
 * and every write is made as the parent on the child's account.
 *
 * "Just me" appears only for hybrid users (an org admin or advisor who is
 * also a parent), whose own pages exist. A pure parent has no own dashboard
 * to switch back to; leaving scope takes them to /family instead.
 *
 * This component was an orphan for a while -- written for the act-as flow,
 * referenced by nothing -- and was rewired rather than rebuilt. It no longer
 * fetches anything itself; the children come from the scope context.
 */
const ProfileSwitcher = ({ compact = false, className = '' }) => {
  const navigate = useNavigate();
  const { effectiveRole } = useAuth();
  const { hasFamily, children, selectedChild, isScoped, enterScope, exitScope, isLoading } = useFamilyScope();
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (!event.target.closest('.profile-switcher')) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!hasFamily || isLoading || children.length === 0) return null;

  const canBeJustMe = effectiveRole !== 'parent';

  const pick = (child) => {
    setIsOpen(false);
    if (child) {
      enterScope(child.id);
      navigate('/dashboard');
    } else {
      exitScope();
      navigate(canBeJustMe ? '/dashboard' : '/family');
    }
  };

  const label = selectedChild ? selectedChild.firstName : (canBeJustMe ? 'Just me' : 'Pick a child');
  const avatar = selectedChild?.avatarUrl;

  // One child, no hybrid role: nothing to switch between. Show who it is.
  const isStatic = children.length === 1 && !canBeJustMe && isScoped;

  return (
    <div className={`profile-switcher relative ${className}`}>
      <button
        type="button"
        onClick={() => !isStatic && setIsOpen((open) => !open)}
        aria-haspopup={isStatic ? undefined : 'listbox'}
        aria-expanded={isStatic ? undefined : isOpen}
        aria-label={selectedChild ? `Working as ${selectedChild.name}` : 'Choose a child'}
        className={`w-full flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition-colors ${isStatic ? 'cursor-default' : 'hover:bg-neutral-50'} ${compact ? '' : 'min-h-[44px]'}`}
      >
        {avatar ? (
          <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
        ) : (
          <UserCircleIcon className="w-7 h-7 text-gray-400 flex-shrink-0" aria-hidden="true" />
        )}
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] uppercase tracking-wider text-gray-500">Working with</span>
            <span className="block truncate text-sm font-semibold text-gray-900">{label}</span>
          </span>
        )}
        {!isStatic && (
          <ChevronDownIcon
            className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute top-full left-0 mt-1 w-full min-w-[220px] bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden py-1"
        >
          {canBeJustMe && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!isScoped}
                onClick={() => pick(null)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-neutral-50 ${!isScoped ? 'font-semibold text-optio-purple' : 'text-gray-900'}`}
              >
                <UserCircleIcon className="w-6 h-6 text-gray-400" aria-hidden="true" />
                Just me
              </button>
            </li>
          )}
          {children.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                role="option"
                aria-selected={selectedChild?.id === child.id}
                onClick={() => pick(child)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-neutral-50 ${selectedChild?.id === child.id ? 'font-semibold text-optio-purple' : 'text-gray-900'}`}
              >
                {child.avatarUrl ? (
                  <img src={child.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-optio-purple/10 text-optio-purple text-xs font-semibold flex items-center justify-center" aria-hidden="true">
                    {(child.name || '?').charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate">{child.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

ProfileSwitcher.propTypes = {
  compact: PropTypes.bool,
  className: PropTypes.string,
};

export default ProfileSwitcher;
