import { test, expect, signInAs } from './fixtures';
import type { Page } from '@playwright/test';

// 13.8 (docs/contracts/grade-submission.md, "Screens"): the Dean's Grade Submissions page and its Superadmin read-only view.
// The live spec cannot expire the 24-hour grace, so the Change Requests tab is covered here with mocked responses.

const request = {
  batchId: 7, csId: 41, courseCode: 'DENT 101', section: 'A', faculty: 'Dr. Faculty Example',
  reason: 'Late lab practical scores for three students.', sentAt: '2026-12-02T09:14:00+08:00', status: 'pending', studentCount: 2,
};
const detail = {
  request,
  students: [
    { studentId: 1, name: 'Alex Example', studentNumber: '2026-0001', oldGrade: 2.5, newGrade: 2.0, changes: [{ kind: 'score', label: 'Lab Practical 1', old: '60', new: '85' }] },
    { studentId: 2, name: 'Bea Sample', studentNumber: '2026-0002', oldGrade: 1.75, newGrade: 1.75, changes: [{ kind: 'attendance', label: 'Attendance 2026-11-03', old: 'Absent', new: 'Present' }] },
  ],
};
const submissions = {
  term: { id: 1, schoolYear: '2026-2027', semester: '1ST' },
  lateFromEarlierTerms: 0,
  classes: [
    { csId: 41, courseCode: 'DENT 101', section: 'A', faculty: 'Dr. Faculty Example', deadline: '2026-12-20', deadlineStatus: 'submitted', submittedAt: '2026-12-01T09:00:00+08:00' },
    { csId: 42, courseCode: 'DENT 102', section: 'B', faculty: 'Dr. Other Faculty', deadline: '2026-12-20', deadlineStatus: 'not_submitted', submittedAt: null },
  ],
};

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Routes registered here win over the fixtures' catch-all because Playwright tries the latest route first.
async function mockGradeApi(page: Page) {
  const calls: { path: string; body: any }[] = [];
  let pending = true;
  await page.route('**/api/admin/grade-submissions**', route => route.fulfill(json(submissions)));
  await page.route('**/api/admin/grade-change-requests**', route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === 'POST') {
      calls.push({ path: url.pathname, body: route.request().postDataJSON() });
      pending = false;
      return route.fulfill(json({ status: 'ok', message: url.pathname.endsWith('/approve') ? 'Grade change approved.' : 'Grade change rejected.' }));
    }
    if (url.pathname.endsWith('/detail')) return route.fulfill(json(detail));
    const wantsPending = url.searchParams.get('state') === 'pending';
    const rows = wantsPending && pending ? [request] : [];
    return route.fulfill(json({ requests: rows, pendingCount: pending ? 1 : 0 }));
  });
  return calls;
}

test('Dean sees the pending badge, expands a request, rejects with a reason of 8 characters', async ({ page }) => {
  const calls = await mockGradeApi(page);
  await signInAs(page, 'admin');
  await page.goto('/admin/grade-submissions?tab=changes');

  // Sidebar item with the pending count.
  const sidebarItem = page.getByRole('link', { name: /Grade Submissions/ }).first();
  await expect(sidebarItem).toBeVisible();
  await expect(sidebarItem).toContainText('1');

  // Submissions tab lists the term's classes; Change Requests lists the pending batch.
  await expect(page.getByRole('heading', { name: /Change Requests · 1 waiting/ })).toBeVisible();
  await expect(page.getByText('DENT 101 A · Dr. Faculty Example')).toBeVisible();
  await expect(page.getByText('Reason: Late lab practical scores for three students.')).toBeVisible();

  // Expanding the row shows each changed student and the changed score.
  await page.getByRole('button', { name: 'Show changes for DENT 101 A' }).click();
  await expect(page.getByText('Alex Example')).toBeVisible();
  await expect(page.getByText('Grade 2.5 → 2')).toBeVisible();
  await expect(page.getByText('Lab Practical 1: 60 → 85')).toBeVisible();
  await expect(page.getByText('Attendance 2026-11-03: Absent → Present')).toBeVisible();

  // Reject needs a reason of at least 8 characters, shown before the button is pressed.
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Reject Grade Change' })).toBeVisible();
  await expect(dialog.getByText('Give a reason of at least 8 characters.')).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Reject', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Reason').fill('too sh');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Reason').fill('1234567');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Reason').fill('Scores need the lab sheet.');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText('Grade change rejected.')).toBeVisible();
  expect(calls).toEqual([{ path: '/api/admin/grade-change-requests/reject', body: { batchId: 7, reason: 'Scores need the lab sheet.' } }]);
  // The list refreshes: nothing waits and the badge is gone.
  await expect(page.getByText('Nothing waiting for you.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Change Requests · 0 waiting/ })).toBeVisible();
});

test('Dean approves a grade change after a confirmation', async ({ page }) => {
  const calls = await mockGradeApi(page);
  await signInAs(page, 'admin');
  await page.goto('/admin/grade-submissions?tab=changes');

  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Approve Grade Change' })).toBeVisible();
  await expect(dialog).toContainText('Approve the grade change for DENT 101 A? The grades of 2 students change as listed.');
  // Cancelling sends nothing.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(calls).toEqual([]);

  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Grade change approved.')).toBeVisible();
  expect(calls).toEqual([{ path: '/api/admin/grade-change-requests/approve', body: { batchId: 7 } }]);
  await expect(page.getByText('Nothing waiting for you.')).toBeVisible();
});

test('Superadmin sees Grade Submissions read-only, without Approve or Reject', async ({ page }) => {
  await mockGradeApi(page);
  await signInAs(page, 'superadmin');
  await page.goto('/superadmin/grade-submissions');

  // Submissions tab is readable.
  await expect(page.getByRole('cell', { name: /DENT 101 A/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /DENT 102 B.*Not submitted/ })).toBeVisible();

  await page.getByRole('tab', { name: /Change Requests|Changes/ }).first().click();
  await expect(page.getByText('Read-only: the Dean approves or rejects grade changes.')).toBeVisible();
  await expect(page.getByText('DENT 101 A · Dr. Faculty Example')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
  // The request still opens to show its changes.
  await page.getByRole('button', { name: 'Show changes for DENT 101 A' }).click();
  await expect(page.getByText('Lab Practical 1: 60 → 85')).toBeVisible();
});
