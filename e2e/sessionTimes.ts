import { expect, type Locator, type Page } from '@playwright/test';

// Start / Edit session time fields (TimePicker): one text field per time (accessible name = its label); Enter commits and closes the wheel flyout.
export type SessionTimeName = 'Opening' | 'Present Cutoff' | 'Late Cutoff' | 'Class End Time';
const FIELD_KEY = { 'Opening': 'openingTime', 'Present Cutoff': 'presentCutoff', 'Late Cutoff': 'lateCutoff', 'Class End Time': 'classEndTime' } as const;
type Scope = Page | Locator;

// 'HH:MM' -> '8:20 am'. The suffix matters: the typed field reads a bare '2:00' as 2 pm.
const typed12 = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

// Start session keeps the two cutoffs under "More settings"; Edit session shows them directly.
export async function openMoreSettings(scope: Scope) {
  const more = scope.getByRole('button', { name: /^More settings/ });
  if (await more.count() && (await more.getAttribute('aria-expanded')) === 'false') await more.click();
}

/** Types a 24-hour 'HH:MM' into one session time field, opening More settings first when needed. */
export async function setSessionTime(scope: Scope, name: SessionTimeName, time: string) {
  if (name === 'Present Cutoff' || name === 'Late Cutoff') await openMoreSettings(scope);
  const field = scope.getByLabel(name, { exact: true });
  await field.fill(typed12(time));
  await field.press('Enter');
  // Wait for the commit to show in the caption, so the next field's typed text is not overwritten by this one's late re-sync.
  await expectSessionTime(scope, name, time);
}

/** Asserts one session time through its caption ('8:20 AM · same day'). */
export async function expectSessionTime(scope: Scope, name: SessionTimeName, time: string) {
  if (name === 'Present Cutoff' || name === 'Late Cutoff') await openMoreSettings(scope);
  const [h, m] = time.split(':').map(Number);
  await expect(scope.getByTestId(`caption-${FIELD_KEY[name]}`)).toHaveText(new RegExp(`^${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}\\b`));
}

export const expectSessionTimes = async (scope: Scope, times: [string, string, string, string]) => {
  const names: SessionTimeName[] = ['Opening', 'Present Cutoff', 'Late Cutoff', 'Class End Time'];
  for (const [i, name] of names.entries()) await expectSessionTime(scope, name, times[i]);
};
