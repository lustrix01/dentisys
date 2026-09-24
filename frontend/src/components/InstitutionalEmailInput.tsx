import React, { useRef } from 'react';

export interface InstitutionalEmailInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement> | { target: { value: string; name?: string }; currentTarget?: { value: string; name?: string } }) => void;
  domain?: string;
  icon?: React.ReactNode;
  containerClassName?: string;
  hasError?: boolean;
}

export const DEFAULT_INSTITUTIONAL_DOMAIN = 'bicol-u.edu.ph';

export const extractEmailUsername = (email: string, domain = DEFAULT_INSTITUTIONAL_DOMAIN): string => {
  if (!email) return '';
  const suffix = `@${domain}`.toLowerCase();
  const trimmed = email.trim();
  if (trimmed.toLowerCase().endsWith(suffix)) {
    return trimmed.slice(0, trimmed.length - suffix.length);
  }
  if (trimmed.includes('@')) {
    return trimmed.split('@')[0];
  }
  return trimmed;
};

export const InstitutionalEmailInput: React.FC<InstitutionalEmailInputProps> = ({
  value,
  onChange,
  domain = DEFAULT_INSTITUTIONAL_DOMAIN,
  icon,
  containerClassName = '',
  hasError = false,
  className = '',
  placeholder = 'username',
  disabled,
  required,
  name = 'email',
  id,
  autoComplete = 'email',
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Extract the local username part before the domain
  const localPart = extractEmailUsername(value, domain);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Strip everything after any '@' and remove spaces, lowercased
    const cleanedLocal = raw.split('@')[0].replace(/\s+/g, '').toLowerCase();
    const fullEmail = cleanedLocal ? `${cleanedLocal}@${domain}` : '';

    if (onChange) {
      // Create a compatible event with fullEmail as target.value
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          name,
          value: fullEmail,
        },
        currentTarget: {
          ...e.currentTarget,
          name,
          value: fullEmail,
        },
      };
      onChange(syntheticEvent);
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={`group flex items-center w-full rounded-xl border transition-all overflow-hidden ${
        hasError
          ? 'border-rose-500 ring-1 ring-rose-500 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-text'} ${containerClassName}`}
    >
      {icon && (
        <div className="pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-accent-500 transition-colors shrink-0">
          {icon}
        </div>
      )}

      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required={required}
        disabled={disabled}
        value={localPart}
        onChange={handleInputChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full flex-1 min-w-0 bg-transparent py-2.5 text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none ${
          icon ? 'pl-2.5 pr-3' : 'px-3.5'
        } ${disabled ? 'cursor-not-allowed' : ''} ${className}`}
        {...rest}
      />

      <div
        className="flex items-center px-3 sm:px-3.5 py-2.5 bg-slate-100/90 dark:bg-slate-800/80 border-l border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-bold select-none whitespace-nowrap shrink-0 group-focus-within:text-accent-600 dark:group-focus-within:text-accent-400 transition-colors"
        title={`Official institutional domain: @${domain}`}
      >
        @{domain}
      </div>
    </div>
  );
};

export default InstitutionalEmailInput;
