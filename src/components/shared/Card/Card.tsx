import React from 'react';
import styled from 'styled-components';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
}

const CardContainer = styled.div`
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--spacing-3);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  &:hover { box-shadow: var(--shadow-hover); }
`;

export const Card: React.FC<CardProps> = ({ header, footer, children, loading, ...rest }) => {
  return (
    <CardContainer {...rest}>
      {header && <div className="card-header">{header}</div>}
      {loading ? <div className="card-body">Loading...</div> : <div className="card-body">{children}</div>}
      {footer && <div className="card-footer">{footer}</div>}
    </CardContainer>
  );
};

export default Card;
