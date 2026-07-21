import React from 'react';
import styled, { css } from 'styled-components';
import { colors, radius } from '../../../design';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const variantStyles = {
  success: css`background: ${colors.success}; color: #fff;`,
  warning: css`background: ${colors.warning}; color: #fff;`,
  danger: css`background: ${colors.danger}; color: #fff;`,
  info: css`background: ${colors.info}; color: #fff;`,
  neutral: css`background: ${colors.border}; color: ${colors.textPrimary};`,
};

const StyledBadge = styled.span<{ $variant: BadgeVariant }>`
  display: inline-block;
  padding: 0 0.5rem;
  font-size: 0.75rem;
  border-radius: ${radius.sm};
  ${(props) => variantStyles[props.$variant]}
`;

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', children }) => (
  <StyledBadge $variant={variant}>{children}</StyledBadge>
);
