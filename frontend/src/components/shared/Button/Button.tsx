import React from 'react';
import styled, { css } from 'styled-components';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'outline';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles = {
  primary: css`
    background: var(--color-primary);
    color: var(--color-surface);
    &:hover { background: var(--color-primary); opacity: 0.9; }
  `,
  secondary: css`
    background: var(--color-secondary);
    color: var(--color-surface);
    &:hover { opacity: 0.9; }
  `,
  ghost: css`
    background: transparent;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
    &:hover { background: var(--color-background); }
  `,
  danger: css`
    background: var(--color-danger);
    color: var(--color-surface);
    &:hover { opacity: 0.9; }
  `,
  outline: css`
    background: transparent;
    color: var(--color-primary);
    border: 1px solid var(--color-primary);
    &:hover { background: var(--color-primary); color: var(--color-surface); }
  `,
};

const StyledButton = styled.button<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  ${(props) => variantStyles[props.variant ?? 'primary']}
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  ...rest
}) => {
  return (
    <StyledButton variant={variant} disabled={disabled || loading} {...rest}>
      {loading ? (
        <span className="spinner" aria-label="loading" />
      ) : (
        <> {icon && <span className="icon">{icon}</span>} {children} </>
      )}
    </StyledButton>
  );
};

export default Button;
