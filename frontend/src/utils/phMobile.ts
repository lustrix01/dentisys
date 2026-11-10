export const PH_MOBILE_MESSAGE = 'Enter a Philippine mobile number such as 0917 123 4567. Check the digits and try again.';

/** '' when blank, null when not a Philippine mobile number, else the 09XXXXXXXXX form. */
export function normalizePhMobile(value: string): string | null {
  const stripped = value.replace(/[\s\-()]/g, '');
  if (stripped === '') return '';
  return /^(09|\+639|639)\d{9}$/.test(stripped) ? `09${stripped.slice(-9)}` : null;
}
