# GRA-03 — Show the grade computation in Full Matrix View (agreed contract)

Status: **built for desktop and approved by the Owner on 2026-11-14 (spec UI-002 amendment applied).** Phones and tablets are the next step and need their own approval.

## Problem

Faculty see each category in Full Matrix View as raw score inputs followed by "Total" and "Weighted". How a score becomes a grade is hidden:

- An assessment's percentage and its transmuted value are never shown.
- "Total" is really the category's **average percentage** (GRD rule 2026-10-26 (1): assessments' effective percentages are averaged, and points are never added up).

## Agreed behaviour

1. **"Show computation" switch** in the Full Matrix toolbar. It is **off by default**, and each browser remembers the Faculty member's last choice.
2. **Computation flow.** With the switch on, every assessment in a category always shows three columns, in this order:
   - **Score** (the input, as today);
   - **%** (score ÷ max × 100);
   - **Transmuted**.
   
   The Transmuted column holds the value that enters the category average, with no On/Off label:
   - transmutation on: % × 0.5 + 50;
   - transmutation off: the same % reprinted;
   - linked session marked Absent: the cell reads **Absent (0)**;
   - attendance not resolved yet: "—", with a hover saying "Waiting for attendance";
   - blank score: "—" in every step, and the grade stays incomplete as today.
3. **Category columns:** "Total" is renamed **"Average %"** everywhere, whether the switch is on or off. "Weighted (x%)" is unchanged.
4. **Period results stay at the end of each period, as today.** Midterm % and Final Midterm Grade follow the Midterm columns, and Finals % and grade follow the Finals columns. The same goes for Lecture % and Laboratory % within each period. The course Final Grade stays last. This matches the college grade-sheet workbook. The Owner withdrew the "one results block at the far right" idea on 2026-11-14, because scrolling to the far end is tedious for Faculty.
5. **No points total.** No "TOTAL points" column (GRD 2026-10-26 (1)).
6. **Not in a Category** assessments keep score inputs only, with no steps, because they feed no grade.
7. Calculated values keep the existing rule: they show the server's computation of the **saved** scores and update after "Save all matrix scores".
8. Excel export, Reports and Single Activity View are unchanged.

Example (Quiz category worth 30%, Quiz 1 transmuted, Quiz 2 not):

| Quiz 1 (20) | % | Transmuted | Quiz 2 (10) | % | Transmuted | Average % | Weighted (30%) |
|---|---|---|---|---|---|---|---|
| 15 | 75.00 | 87.50 | 8 | 80.00 | 80.00 | 83.75 | 25.13 |
| 12 | 60.00 | Absent (0) | 9 | 90.00 | 90.00 | 45.00 | 13.50 |

## API contract (additive, no schema change)

Each period breakdown gains an `assessmentSteps` array. It has one entry for every assessment of that period that belongs to a category, including assessments in a category that is not complete yet, so their % still shows:

```json
{ "assessmentId": "123", "categoryId": 7, "rawPercentage": 75.0, "transmuted": true,
  "effectivePercentage": 87.5, "attendanceStatus": null }
```

(This replaces the per-category `assessments` array of the first draft. Incomplete categories are left out of `categories[]` today, so a per-category list would have hidden those steps.)

- `attendanceStatus` is `"absent"`, `"present"`, `"late"`, `"excused"`, `"unresolved"` or `null` (no link).
- `rawPercentage` is `null` when the score is blank.
- `effectivePercentage` is `null` when the score is blank or attendance is unresolved, and `0` when the student is absent.
- The server already computes these values; the response only exposes them, and the client does no grade math.
- Existing fields, rounding and stored grades are unchanged. Nothing is recalculated.

## Spec amendment (applied 2026-11-14)

UI-002, Owner-approved amendment (2026-11-13): *Full Matrix View has a "Show computation" switch (default off, remembered per browser). When it is on, each categorised assessment shows Score, % and Transmuted. Transmuted holds the value used in the category average: the transmuted percentage, the same % when transmutation is off, or "Absent (0)". Each category shows "Average %" (formerly "Total") and its Weighted contribution. No points total is shown. Period results stay at the end of each period. Values are the server's computation of saved scores.*

## Checks when built

- Server contract test for the `assessments` array: transmuted, not transmuted, absent, unresolved and blank.
- A Full Matrix e2e with the switch on and off, and with the summary block on the right.
- A Before/After demo on desktop; with the switch off, only the column order and the "Average %" header change.
