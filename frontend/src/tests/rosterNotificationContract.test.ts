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

