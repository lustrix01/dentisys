import React from 'react';
import styled, { css } from 'styled-components';

export interface Option {
  value: string | number;
  label: string;
  disabled?: boolean;
  group?: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[];
  loading?: boolean;
  searchable?: boolean; // placeholder for future search implementation
  clearable?: boolean;
  placeholder?: string;
}

const StyledSelect = styled.select<SelectProps>`
  width: 100%;
  padding: var(--spacing-1) var(--spacing-2);
  border: 1px solid ${(props) => (props.disabled ? 'var(--color-border)' : 'var(--color-border)')};
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  &:focus { outline: 2px solid var(--color-primary); }
`;

export const Select: React.FC<SelectProps> = ({ options, loading, placeholder, disabled, ...rest }) => {
  return (
    <StyledSelect disabled={disabled || loading} {...rest}>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </StyledSelect>
  );
};

export default Select;
