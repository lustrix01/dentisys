# Join a class by code (backlog 12.4): DRAFT v1

Status: agreed in /grill-me 2026-11-15 (Q1, Q2, auto-approve); Class Secretaries see and share the code but cannot regenerate or turn it off; only the class Faculty approve or reject requests (agreed). No code.

## 1. What exists now

- Faculty build a class roster by importing the BU "Official List of Enrollment" or adding Students; each row is a canonical Student record (Student number, name, `@bicol-u.edu.ph` email) enrolled in that class (CLS, roster import).
- Faculty then invite Students from the class; the invitation email carries a 7-day activation link (REG, "Faculty and Student invitations expire 7 days after they are sent"). Accepting creates the password and activates the account.
- An active Student cannot be re-invited; a Student already on another class keeps one account, and a new class's roster import enrolls their existing record.
- Spec REG (Student onboarding): "A Student email alone MUST NOT authorize onboarding." Only an authorized Faculty member may invite a Student from an assigned class.

So today a Student who is on the roster already sees the class; the code matters for (1) Students not on the imported roster (irregular, cross-enrolled, late additions) and (2) Faculty who would rather share one code than invite one by one.

## 2. Options

| Option | A Student enters the code… | Faculty control | Risk |
|---|---|---|---|
| **A. Roster match only** | joins only if their Student record is already on that class's roster | full (roster) | adds little: roster Students already see the class |
| **B. Request to join** | sends a join request; Faculty approve or reject in the roster | full | Faculty do one approval per request |
| **C. Instant join** | is enrolled at once | none until removed | a leaked code lets anyone in |
| **A + B** | on the roster: confirmed at once; not on the roster: request to Faculty | full | — |

## 3. Recommendation: A + B

- **Code**: 6 characters, letters and digits without look-alikes (no 0/O, 1/I/L), e.g. `K7M-4QX`. One code per class, shown in the class roster with Copy and **New code** (the old one stops working). No expiry by default; Faculty may turn the code off.
- **Who can use it**: a signed-in, active Student account (official email by construction). A new person with no account still needs the invitation (onboarding stays as today).
- **On the roster** (their Student record is on the class): the class is confirmed and appears in My Classes.
- **Auto-approve** (Owner decision 2026-11-15): a per-class switch in the roster, off by default. When on, join requests are approved at once.
- **Not on the roster**: a join request with the Student's number and name; the Faculty sees it in the roster as "Wants to join" with Approve / Reject. Approve adds them like a manual add.
- **Errors**: wrong or turned-off code "That code does not match an open class."; already in the class "You are already in this class."; class archived or not this school year: same message as a wrong code. 10 wrong codes in 15 minutes per account → "Too many tries. Wait 15 minutes." (rate limit like sign-in).
- **Audit**: `class_code_regenerated`, `class_code_disabled`, `class_join_requested`, `class_join_approved`, `class_join_rejected` (Faculty-visible, Dean overview).
- Student side: **Join a class** on My Classes (button + one field), on phone and desktop.

## 4. Questions for /grill-me

1. Use A + B (roster Students join at once, others need Faculty approval) rather than instant join?
2. Code format: 6 characters without look-alikes, one per class, regenerate any time?
3. Should codes expire (for example after the first two weeks of the term), or stay until Faculty turn them off?
4. Can Class Secretaries see and share the code, or Faculty only?
5. Who approves join requests: the class Faculty only?
6. Rate limit: 10 wrong codes per 15 minutes per account?
