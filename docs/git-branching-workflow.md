# Requirement 5 — Git Branching Workflow Log

> **SLO 3 · Applying**  
> Documentation of the team's actual Git workflow for module development, command execution sequence, and pull request review evidence.

---

## 1. Module Overview & Branching Strategy

* **Module Name**: Student Authentication, Faculty Invitation & Email Management Module
* **Target Integration Branch**: `main` (production-ready stable branch) / `develop`
* **Feature Branch Name**: `lumbang` (working feature branch: `origin/lumbang`)
* **Repository**: [`https://github.com/lustrix01/dentisys.git`](https://github.com/lustrix01/dentisys.git)

---

## 2. Exact Command Sequence Used

Below is the step-by-step sequence of Git commands executed during the development and integration of the module:

```bash
# 1. Update local repository and switch to main/develop
git checkout main
git pull origin main

# 2. Create and switch to the feature branch
git checkout -b lumbang

# 3. Work on authentication and invitation components, staging changes incrementally
git add frontend/src/pages/auth/SignUp.tsx
git add frontend/src/pages/auth/ActivateSecretary.tsx
git add backend/controllers/FacultyInvitationController.php
git add frontend/src/pages/faculty/EmailManagement.tsx

# 4. Commit feature changes with descriptive message
git commit -m "feat(auth): implement student authentication and faculty invitation management"

# 5. Push feature branch to remote origin
git push origin lumbang

# 6. Open Pull Request on GitHub and await code review
# (PR #6 submitted: https://github.com/lustrix01/dentisys/pull/6)

# 7. Post-approval sync and branch cleanup
git checkout main
git pull origin main
```

---

## 3. Pull Request & Code Review Evidence

### Pull Request Summary

| Field | Detail |
| :--- | :--- |
| **Pull Request ID** | **Pull Request #6** |
| **Title** | `sign up` (Student Authentication & Faculty Onboarding) |
| **Branch Source** | `lustrix01/lumbang` |
| **Target Branch** | `lustrix01/main` |
| **Merge Commit Hash** | `f23d7569a942ca195a651e506856a5091ecee2af` |
| **Merge Date** | `Sat Jul 18 15:52:28 2026 +0800` |
| **PR Link** | [`https://github.com/lustrix01/dentisys/pull/6`](https://github.com/lustrix01/dentisys/pull/6) |

### Code Reviewer Approval

* **Feature Author**: Owhie Lumbang (`lustrix01/lumbang`)
* **Reviewer**: Teammate Reviewer / Repository Maintainer (`lustrix01`)
* **Review Status**: **Approved & Merged**
* **Verification Log**:
  ```text
  commit f23d7569a942ca195a651e506856a5091ecee2af
  Merge: 676025b 58d8589
  Author: lustrix01 <owhielumbang111@gmail.com>
  Date:   Sat Jul 18 15:52:28 2026 +0800

      Merge pull request #6 from lustrix01/lumbang
      
      sign up
  ```

---

## 4. Additional Pull Request Log

| PR ID | Feature Branch | Summary / Module | Merge Commit | Status |
| :--- | :--- | :--- | :--- | :--- |
| **PR #5** | `lustrix01/lumbang` | Add email management for faculty | `676025bda2d6e9c3ab38295b76ad13dfab018c76` | Merged |
| **PR #4** | `lustrix01/lumbang` | Fix audit trail security logging | `16ba7be2fd7b2a4777d9614ba8a53bf42c26ead0` | Merged |
| **PR #3** | `lustrix01/lumbang` | Minor UI & routing adjustments | `2f799b7d499438f41ad606354efb49b5d7fc4824` | Merged |
| **PR #1** | `lustrix01/lumbang` | Initial project structure refactor | `86939876da0e7eb2c75b092ff1346a1af6aaa55f` | Merged |
