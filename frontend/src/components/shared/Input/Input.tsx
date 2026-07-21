import React from 'react';
import styled from 'styled-components';
import { colors } from '../../../design';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  helperText?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
`;

const StyledLabel = styled.label`
  font-size: 0.875rem;
  color: var(--color-text-primary);
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const StyledInput = styled.input<{ $hasError?: boolean; $hasPrefix?: boolean; $hasSuffix?: boolean }>`
  width: 100%;
  padding: var(--spacing-1) var(--spacing-2);
  padding-left: ${(props) => (props.$hasPrefix ? '2.5rem' : 'var(--spacing-2)')};
  padding-right: ${(props) => (props.$hasSuffix ? '2.5rem' : 'var(--spacing-2)')};
  border: 1px solid ${props => props.$hasError ? colors.danger : colors.border};
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  &:focus { outline: 2px solid var(--color-primary); }
`;

const Prefix = styled.span`
  position: absolute;
  left: var(--spacing-1);
`;

const Suffix = styled.span`
  position: absolute;
  right: var(--spacing-1);
`;

const Helper = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-secondary);
`;

const ErrorMsg = styled.span`
  font-size: 0.75rem;
  color: var(--color-danger);
`;

export const Input: React.FC<InputProps> = ({ label, helperText, error, prefix, suffix, ...rest }) => (
  <Wrapper>
    {label && <StyledLabel>{label}</StyledLabel>}
    <InputWrapper>
      {prefix && <Prefix>{prefix}</Prefix>}
      <StyledInput $hasError={!!error} $hasPrefix={!!prefix} $hasSuffix={!!suffix} {...rest} />
      {suffix && <Suffix>{suffix}</Suffix>}
    </InputWrapper>
    {error ? <ErrorMsg>{error}</ErrorMsg> : helperText && <Helper>{helperText}</Helper>}
  </Wrapper>
);

export default Input;
