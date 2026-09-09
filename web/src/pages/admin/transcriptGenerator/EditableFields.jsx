// Click-to-edit fields used throughout the printable transcript: staff correct
// a name or a date in place, and the same markup prints as plain text.
import React, { useState, useRef, useEffect } from 'react';

// Inline editable text field -- click to edit, blur/enter to save
const EditableField = ({ value, onChange, className = '', printClassName = '' }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); }}}
        className={`bg-blue-50 border-b border-blue-400 outline-none px-0.5 no-print-edit ${className}`}
        style={{ fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit' }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:bg-blue-50 hover:border-b hover:border-blue-300 transition-colors no-print-hover ${className} ${printClassName}`}
      title="Click to edit"
    >
      {value || <span className="text-gray-300 italic no-print">Click to add</span>}
    </span>
  );
};

// Date picker field -- click text to open native date picker
const DatePickerField = ({ value, rawDate, onChange, className = '' }) => {
  const inputRef = useRef(null);

  const formatDateLocal = (d) => {
    if (!d) return '';
    const parts = d.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[m - 1]} ${day}, ${y}`;
  };

  const inputValue = rawDate ? rawDate.split('T')[0] : '';

  return (
    <span className={`inline-block ${className}`}>
      <input
        ref={inputRef}
        type="date"
        value={inputValue}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw) onChange(formatDateLocal(raw), raw);
        }}
        className="sr-only"
      />
      <span
        onClick={() => inputRef.current?.showPicker()}
        className="cursor-pointer hover:bg-blue-50 hover:border-b hover:border-blue-300 transition-colors"
        title="Click to select date"
      >
        {value || <span className="text-gray-300 italic no-print">Click to add</span>}
      </span>
    </span>
  );
};

export { EditableField, DatePickerField };
