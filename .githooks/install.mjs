#!/usr/bin/env node
/**
 * install.mjs - points this clone's git at .githooks/ (pre-commit, commit-msg).
 * Runs from the root package.json "prepare" script, so `npm ci` and `npm install`
 * turn the hooks on. Outside a git checkout it does nothing and never fails the install.
 */
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.log('git hooks: core.hooksPath = .githooks');
} catch {
  // not a git checkout, or git is missing: nothing to install
}
