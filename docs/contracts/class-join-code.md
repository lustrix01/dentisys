# Join a class by code (backlog 12.4): v2

Status: agreed in /grill-me 2026-11-15 (Q1, Q2, auto-approve); Class Secretaries do not see the code (Owner, 2026-11-16, replacing the 2026-11-15 answer); only the class Faculty approve or reject requests (agreed). No code.

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

## 5. Decisions 2026-11-16

- Built together with 12.3 in one batch.
- Codes stop working when the class's term ends (Q3). Rate limit 10 wrong codes per 15 minutes per account (Q6).
- Code + link: a join link opens Join a class with the code filled in.
- A + B merged: a Student already actively enrolled gets "You are already in this class."; everyone else sends a join request (or is approved at once when Auto-approve is on).

## 6. Spec amendment (approved by the Owner 2026-11-16, in spec.md)

**New CLS-004 — Join a class by code (Status: APPROVED, Owner decision 2026-11-16):**

> Each current class has one join code: 6 characters from letters and digits without look-alikes (no 0, O, 1, I or L), shown as "K7M-4QX", and a join link that opens Join a class with the code filled in, signing in first when needed. Only the class's Faculty see, copy and share the code and link (Owner decision 2026-11-16: Class Secretaries do not). Each class card on My Classes & Rosters shows the code hidden, with a button to reveal it and a Copy button; the roster's Join code button holds the link, the settings and the join requests. Only the class's Faculty make a New code (the old code and link stop working at once) or turn the code off and on. A code stops working when the class's term ends or the class is archived. Faculty share the code and link with Students themselves; DentiSYS sends no email with them.
>
> A signed-in active Student enters the code under Join a class on My Classes, on phone and desktop. The code never creates an account: a person without one still needs the invitation (REG-001). A Student already actively enrolled sees "You are already in this class."; one with a pending request sees "Your request to join is waiting for the Faculty." Before joining, once a full code is entered, the dialog shows the class it belongs to (course code and title, section, Faculty, semester and S.Y.) so the Student can check it; looking up a wrong code counts as a wrong try (Owner decision 2026-11-16). Before submitting, a confirmation repeats the class identity and explains that class settings may enroll the Student immediately or send the request to the Faculty for approval. On Join, DentiSYS creates a join request with the Student's number and name; My Classes shows it as "Waiting for approval", and the class's Faculty see it on the roster as "Wants to join" with Approve and Reject. Only the class's Faculty decide. Approve enrolls the Student like adding them to the roster, with the NTF-001 notice; Reject removes the request and gives the Student an in-app notice. A per-class Auto-approve switch, off by default and changed only by the Faculty, approves requests at once.
>
> A wrong, turned-off or replaced code, and the code of a class whose term ended or that is archived, give "That code does not match an open class." Ten wrong codes within 15 minutes for one account give "Too many tries. Wait 15 minutes."

**REG-001, one sentence added:** "A join code or link (CLS-004) lets an active Student ask to join a class; it never creates or activates an account."

**Audit (docs/contracts/audit-logging.md 5.2, next to the roster events):** "Join code replaced", "Join code turned off", "Join code turned on", "Auto-approve changed", "Join requested" (Student's own action, Faculty-visible for the class), "Join request approved", "Join request rejected".
