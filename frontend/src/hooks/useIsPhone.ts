import { useEffect, useState } from 'react';

/** True below the 640 px phone-card breakpoint (spec.md UI-001). */
export function useIsPhone(query = '(max-width: 639px)'): boolean {
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsPhone(mq.matches);
    setIsPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return isPhone;
}
