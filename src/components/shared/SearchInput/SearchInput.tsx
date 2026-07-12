import React, { useState, ChangeEvent } from 'react';
import styled from 'styled-components';
import { useDebounce } from '../../../hooks/useDebounce';
import { SearchIcon, XIcon } from 'react-icons/md';

const Wrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const Input = styled.input`
  width: 100%;
  padding: var(--spacing-1) var(--spacing-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  &:focus { outline: 2px solid var(--color-primary); }
`;

const IconWrapper = styled.span`
  position: absolute;
  left: var(--spacing-2);
  display: flex;
  align-items: center;
  pointer-events: none;
`;

const ClearButton = styled.button`
  position: absolute;
  right: var(--spacing-2);
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
`;

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  debounceMs?: number;
  onSearch?: (value: string) => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({ debounceMs = 300, onSearch, ...rest }) => {
  const [value, setValue] = useState('');
  const debounced = useDebounce(value, debounceMs);

  React.useEffect(() => {
    if (onSearch) onSearch(debounced);
  }, [debounced, onSearch]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const clear = () => setValue('');

  return (
    <Wrapper>
      <IconWrapper><SearchIcon /></IconWrapper>
      <Input value={value} onChange={handleChange} {...rest} />
      {value && <ClearButton onClick={clear}><XIcon /></ClearButton>}
    </Wrapper>
  );
};

export default SearchInput;
