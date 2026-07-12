import React from 'react';
import styled from 'styled-components';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
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

const StyledTextarea = styled.textarea<TextareaProps>`
  width: 100%;
  padding: var(--spacing-1) var(--spacing-2);
  border: 1px solid ${(props) => (props.error ? 'var(--color-danger)' : 'var(--color-border)')};
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  resize: vertical;
  &:focus { outline: 2px solid var(--color-primary); }
`;

const Helper = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-secondary);
`;

const ErrorMsg = styled.span`
  font-size: 0.75rem;
  color: var(--color-danger);
`;

export const Textarea: React.FC<TextareaProps> = ({ label, helperText, error, ...rest }) => (
  <Wrapper>
    {label && <StyledLabel>{label}</StyledLabel>}
    <StyledTextarea error={!!error} {...rest} />
    {error ? <ErrorMsg>{error}</ErrorMsg> : helperText && <Helper>{helperText}</Helper>}
  </Wrapper>
);

export default Textarea;
