import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rosterPage = fs.readFileSync(path.join(currentDirectory, '../pages/faculty/ClassesAndRosters.tsx'), 'utf8');
const layout = fs.readFileSync(path.join(currentDirectory, '../components/Layout.tsx'), 'utf8');
const apiClient = fs.readFileSync(path.join(currentDirectory, '../services/apiClient.ts'), 'utf8');

test('Faculty roster profile edits use the authoritative update and reload contract', () => {
  assert.match(rosterPage, /updateFacultyStudentApi\(/);
  assert.match(rosterPage, /await fetchData\(\);/);
  assert.match(rosterPage, /Student number and class membership stay protected by the server/);
  assert.match(rosterPage, /Select a class section before removing a Student enrolled in multiple assigned classes/);
  assert.match(apiClient, /return request\('PUT', `\/faculty\/students\/\$\{encodeURIComponent\(String\(studentId\)\)\}`, data\)/);
});

test('Notification read state compares API string identifiers consistently', () => {
  assert.match(layout, /const handleMarkAsRead = async \(rawId: number \| string\)/);
  assert.match(layout, /const id = String\(rawId\)/);
  assert.match(layout, /String\(n\.id\) === id/);
});


test('Layout drawer ignores the saved fold below 768px', () => {
  assert.match(layout, /matchMedia\('\(max-width: 767px\)'\)/);
  assert.match(layout, /const isSidebarCollapsed = savedSidebarCollapsed && !isPhone;/);
  assert.match(layout, /localStorage\.setItem\('dentisys_sidebar_collapsed', String\(next\)\)/);
});

test('Start Session pop-up starts the chosen current-year section', () => {
  const startSession = fs.readFileSync(path.join(currentDirectory, '../pages/secretary/AttendanceList.tsx'), 'utf8');
  const modal = fs.readFileSync(path.join(currentDirectory, '../components/StartSessionModal.tsx'), 'utf8');
  assert.match(startSession, /getSecretaryDashboardKpisApi\('current'\)/);
  assert.match(startSession, /const csId = parseInt\(startCsId, 10\)/);
  assert.match(modal, /aria-label="Selected class"/);
  assert.match(startSession, /initialRoom=\{startSections\.find/);
  assert.match(startSession, /getSecretaryActiveAttendanceSessionApi\(Number\(sec\.classId\)\)/);
  assert.match(startSession, /has a live session\./);
});
