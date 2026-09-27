#!/usr/bin/env python3
"""Deterministic generator for the DentiSys development demo seed.

Usage (from the repository root, any Python 3.9+):
    python3 database/seeds/generate_development_demo.py database/seeds/development-demo.sql docs/demo-accounts.md

The output is identical on every run. Edit this script, never the generated
files. All people and records are fictional. Passwords are role-based: see
PASSWORD and the bcrypt hashes in HASH below.
"""
import random
import sys
from datetime import date, datetime, timedelta, time

R = random.Random(20260927)

HASH = {
    'admin': '$2y$10$svr00Fut.38haHTd27zuIe3YLOXZepPubkMkF8K5Q49ytCgjy28Vu',      # Admin123!
    'faculty': '$2y$10$3OfHmV2FaxfK911l8ZZxV.paOsQVbJTTwTtEtzPkxY3TEv9xyDBlm',    # Faculty123!
    'secretary': '$2y$10$GZiQTRYcddOZ6iml/GBtI.4usZeczmzJWgiqCn1iYHfd2eUiOBLhq',  # Secretary123!
    'student': '$2y$10$C4JygFNbn/ISoVUs6J1HMeSItSvxMk.8ZMlzch4J284p9777BJoDq',    # Student123!
}
PASSWORD = {'admin': 'Admin123!', 'faculty': 'Faculty123!', 'secretary': 'Secretary123!', 'student': 'Student123!'}
CURRENT_SY = '2026-2027'
DOMAIN = 'bicol-u.edu.ph'
MANILA_OFFSET = timedelta(hours=8)  # Asia/Manila, no DST


def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, datetime):
        return "'" + v.strftime('%Y-%m-%d %H:%M:%S') + "'"
    if isinstance(v, date):
        return "'" + v.isoformat() + "'"
    if isinstance(v, time):
        return "'" + v.strftime('%H:%M:%S') + "'"
    return "'" + str(v).replace("'", "''") + "'"


def utc(d: date, t: time) -> datetime:
    """Manila local date/time -> naive UTC timestamp (the app stores UTC without zone)."""
    return datetime.combine(d, t) - MANILA_OFFSET


def slug(s: str) -> str:
    out = s.lower().replace('ñ', 'n').replace(' ', '').replace('-', '').replace('.', '')
    return out


def pct_to_gwa(p: float) -> float:
    for lo, g in ((97, 1.0), (94, 1.25), (91, 1.5), (88, 1.75), (85, 2.0), (82, 2.25), (80, 2.5), (78, 2.75), (75, 3.0)):
        if p >= lo:
            return g
    return 5.0


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------
# (user_id, email, role, prefix, first, middle, last, suffix, title, status, created)
STAFF = [
    (1, 'admin@', 'admin', 'Dr.', 'Maria', 'Villareal', 'Santos', 'DMD, PhD', 'Dean, College of Dental Medicine', 'Active', date(2024, 1, 10)),
    (2, 'faculty@', 'faculty', 'Dr.', 'Roberto', 'Lim', 'Santos', 'DMD', 'Department Chair, Restorative Dentistry', 'Active', date(2024, 1, 15)),
    (3, 'dr.reyes@', 'faculty', 'Dr.', 'Angela', 'Marquez', 'Reyes', 'DMD, MSc', 'Associate Professor, Periodontics', 'Active', date(2024, 1, 16)),
    (4, 'dr.cruz@', 'faculty', 'Dr.', 'Fernando', 'Ocampo', 'Cruz', 'DMD', 'Clinical Instructor, Prosthodontics', 'Active', date(2024, 1, 17)),
    (5, 'dr.aquino@', 'faculty', 'Dr.', 'Patricia', 'Salazar', 'Aquino', 'DMD', 'Lecturer, Oral Anatomy', 'Active', date(2024, 1, 18)),
    (6, 'dr.torres@', 'faculty', 'Dr.', 'Ramon', 'Dizon', 'Torres', 'DMD', 'Lecturer, Ethics and Practice Management', 'Active', date(2024, 1, 19)),
    (7, 'pending.faculty1@', 'faculty', 'Dr.', 'Jessica', 'Lorenzo', 'Mendoza', 'DMD', 'Applicant Faculty', 'Pending Approval', date(2026, 9, 21)),
    (8, 'pending.faculty2@', 'faculty', 'Dr.', 'Gabriel', 'Soriano', 'Navarro', 'DMD', 'Applicant Faculty', 'Pending Approval', date(2026, 9, 22)),
    (11, 'dr.bautista@', 'faculty', 'Dr.', 'Carmela', 'Ramos', 'Bautista', 'DMD', 'Assistant Professor, Oral Medicine', 'Active', date(2024, 6, 3)),
    (12, 'dr.villanueva@', 'faculty', 'Dr.', 'Enrique', 'Pascual', 'Villanueva', 'DMD, MPH', 'Associate Professor, Community Dentistry', 'Active', date(2024, 6, 4)),
    (13, 'dr.delrosario@', 'faculty', 'Dr.', 'Kristine', 'Abad', 'Del Rosario', 'DMD', 'Clinical Instructor, Pediatric Dentistry', 'Active', date(2025, 6, 2)),
    (14, 'dr.garcia@', 'faculty', 'Dr.', 'Antonio', 'Manalo', 'Garcia', 'DMD, MS', 'Professor, Oral and Maxillofacial Surgery', 'Active', date(2024, 6, 5)),
    (15, 'dr.lopez@', 'faculty', 'Dr.', 'Rowena', 'Tan', 'Lopez', 'DMD', 'Instructor, Dental Materials', 'Active', date(2025, 6, 3)),
]
FAC = {s[1].split('@')[0]: s[0] for s in STAFF}

# ---------------------------------------------------------------------------
# Courses: code -> (name, units, year, sem, desc, clinical, grading_config)
# ---------------------------------------------------------------------------
COURSES = [
    ('DENT101', 'Dental Orientation and Ethics', 2, 1, '1ST', 'Introduction to the dental profession, jurisprudence, infection control, and ethical codes.', 0, (30, 45, 15, 10)),
    ('ANAT102', 'Head and Neck Anatomy', 3, 1, '2ND', 'Osteology, musculature, vasculature, and innervation of the head and neck.', 0, (25, 45, 20, 10)),
    ('ORAL201', 'Oral Anatomy and Histology', 3, 2, '1ST', 'Microscopic and macroscopic anatomy of teeth and supporting structures.', 0, (25, 40, 25, 10)),
    ('DMAT202', 'Dental Materials', 3, 2, '2ND', 'Properties, manipulation, and clinical selection of restorative and impression materials.', 0, (20, 40, 30, 10)),
    ('CLIN301', 'Prosthodontics I', 3, 3, '1ST', 'Complete denture fabrication, impressions, jaw relations, and occlusion principles.', 1, (20, 30, 40, 10)),
    ('CLIN302', 'Periodontics I', 3, 3, '2ND', 'Diagnosis and non-surgical management of periodontal diseases.', 1, (20, 30, 40, 10)),
    ('CLIN401', 'Clinical Dentistry I', 4, 4, '1ST', 'Comprehensive clinical patient care, restorative procedures, and oral surgery practicum.', 1, (15, 25, 50, 10)),
    ('CLIN402', 'Clinical Dentistry II', 4, 4, '2ND', 'Advanced clinical patient management, crown and bridge, and pediatric dentistry.', 1, (15, 25, 50, 10)),
]
COURSE_BY = {c[0]: c for c in COURSES}
COURSE_FOR = {(1, '1ST'): 'DENT101', (1, '2ND'): 'ANAT102', (2, '1ST'): 'ORAL201', (2, '2ND'): 'DMAT202',
              (3, '1ST'): 'CLIN301', (3, '2ND'): 'CLIN302', (4, '1ST'): 'CLIN401', (4, '2ND'): 'CLIN402'}
SECTION_PREFIX = {'DENT101': 'DENT', 'ANAT102': 'ANAT', 'ORAL201': 'ORAL', 'DMAT202': 'DMAT',
                  'CLIN301': 'PROSTHO', 'CLIN302': 'PERIO', 'CLIN401': 'CLINIC', 'CLIN402': 'CLINIC'}
LAB_ROOM = {1: 'Preclinical Lab 1', 2: 'Dental Materials Lab', 3: 'Prosthodontics Lab', 4: 'Dental Clinic'}

TERMS = {
    ('2024-2025', '1ST'): (date(2024, 8, 12), date(2024, 12, 20)),
    ('2024-2025', '2ND'): (date(2025, 1, 13), date(2025, 5, 30)),
    ('2025-2026', '1ST'): (date(2025, 8, 11), date(2025, 12, 19)),
    ('2025-2026', '2ND'): (date(2026, 1, 12), date(2026, 5, 29)),
    ('2026-2027', '1ST'): (date(2026, 8, 10), date(2026, 12, 18)),
}
TODAY = date(2026, 9, 27)

# Instructor per (school_year, semester, cs_name)
INSTRUCTOR = {
    ('2026-2027', '1ST', 'DENT-1A'): 'dr.torres', ('2026-2027', '1ST', 'DENT-1B'): 'dr.delrosario',
    ('2026-2027', '1ST', 'ORAL-2A'): 'dr.aquino', ('2026-2027', '1ST', 'ORAL-2B'): 'dr.lopez',
    ('2026-2027', '1ST', 'PROSTHO-3A'): 'dr.cruz', ('2026-2027', '1ST', 'PROSTHO-3B'): 'dr.reyes',
    ('2026-2027', '1ST', 'CLINIC-4A'): 'faculty', ('2026-2027', '1ST', 'CLINIC-4B'): 'faculty',
}
PAST_ROTATION = ['dr.bautista', 'dr.villanueva', 'dr.garcia', 'dr.aquino', 'dr.torres', 'dr.reyes',
                 'dr.cruz', 'faculty', 'dr.lopez', 'dr.delrosario']

# ---------------------------------------------------------------------------
# Names
# ---------------------------------------------------------------------------
MALE = ['Aaron', 'Adrian', 'Albert', 'Andrei', 'Angelo', 'Anthony', 'Benedict', 'Bryan', 'Carl', 'Carlo', 'Christian',
        'Daniel', 'Darwin', 'Dominic', 'Earl', 'Edgar', 'Elijah', 'Emmanuel', 'Francis', 'Gabriel', 'Gerald', 'Harold',
        'Ivan', 'Jericho', 'John Paul', 'Jose Miguel', 'Joshua', 'Kenneth', 'Kevin', 'Lance', 'Leonardo', 'Mark Anthony',
        'Marvin', 'Nathaniel', 'Noel', 'Paolo', 'Patrick', 'Rafael', 'Ralph', 'Renz', 'Rodel', 'Ryan', 'Samuel',
        'Tristan', 'Vincent', 'Xavier', 'Zachary']
FEMALE = ['Abigail', 'Aileen', 'Alyssa', 'Andrea', 'Angelica', 'Anne Marie', 'Bianca', 'Camille', 'Carmina', 'Charmaine',
          'Christine', 'Clarisse', 'Danica', 'Denise', 'Diana', 'Elaine', 'Erika', 'Frances', 'Gwyneth', 'Hazel',
          'Isabel', 'Jasmine', 'Joanna', 'Katrina', 'Kimberly', 'Kristel', 'Lara', 'Lorraine', 'Maria Clara', 'Mariel',
          'Nicole', 'Patricia', 'Pauline', 'Rachelle', 'Regine', 'Rica', 'Samantha', 'Sofia', 'Stephanie', 'Trisha',
          'Vanessa', 'Veronica', 'Ysabel']
SURNAMES = ['Abad', 'Agustin', 'Alcantara', 'Andrada', 'Arevalo', 'Balagtas', 'Baltazar', 'Barrameda', 'Belmonte', 'Bernal',
            'Borja', 'Buenaventura', 'Cabrera', 'Calleja', 'Castillo', 'Castro', 'Clemente', 'Corpuz', 'Cortez', 'David',
            'De Guzman', 'De Leon', 'Dela Paz', 'Delos Reyes', 'Diaz', 'Dimaculangan', 'Domingo', 'Enriquez', 'Escobar',
            'Espiritu', 'Esteban', 'Evangelista', 'Fajardo', 'Feliciano', 'Fernandez', 'Flores', 'Francisco', 'Gonzales',
            'Guevarra', 'Gutierrez', 'Hernandez', 'Ignacio', 'Jimenez', 'Lacson', 'Lagman', 'Llanes', 'Luna', 'Macaraeg',
            'Magbanua', 'Malabanan', 'Manansala', 'Marasigan', 'Medina', 'Mercado', 'Miranda', 'Morales', 'Nepomuceno',
            'Nicolas', 'Nuñez', 'Obispo', 'Olivares', 'Ortega', 'Padilla', 'Panganiban', 'Pangilinan', 'Perez', 'Quiambao',
            'Quizon', 'Rivera', 'Robles', 'Rosales', 'Sabado', 'Samonte', 'San Jose', 'Santiago', 'Sarmiento', 'Serrano',
            'Tolentino', 'Tuazon', 'Umali', 'Valdez', 'Valenzuela', 'Vergara', 'Villafuerte', 'Yap', 'Zamora']

COHORTS = [2023, 2024, 2025, 2026]
PER_COHORT = 30


def year_level(cohort, sy_start):
    return sy_start - cohort + 1


# ---------------------------------------------------------------------------
# Build students
# ---------------------------------------------------------------------------
students = []  # dicts
used_names = set()
used_emails = {'admin', 'faculty', 'secretary', 'student'}
sid = 0
for cohort in COHORTS:
    for n in range(1, PER_COHORT + 1):
        sid += 1
        block = 'A' if n <= 15 else 'B'
        if sid == 24:  # legacy fixture id kept for tests: secretary@ (Bea Alonzo), cohort 2023 block B
            s = dict(first='Bea', middle='Mercado', last='Alonzo', sex='F', email='secretary@' + DOMAIN)
        elif cohort == 2026 and n == 1:
            s = dict(first='Juan Miguel', middle='Reyes', last='Dela Cruz', sex='M', email='student@' + DOMAIN)
        else:
            while True:
                sex = R.choice('MF')
                first = R.choice(MALE if sex == 'M' else FEMALE)
                last = R.choice(SURNAMES)
                middle = R.choice([x for x in SURNAMES if x != last])
                if (first, last) not in used_names:
                    break
            base = slug(first) + '.' + slug(last)
            email_local, k = base, 2
            while email_local in used_emails:
                email_local, k = f'{base}{k}', k + 1
            s = dict(first=first, middle=middle, last=last, sex=sex, email=f'{email_local}@{DOMAIN}')
        used_names.add((s['first'], s['last']))
        used_emails.add(s['email'].split('@')[0])
        s.update(
            student_id=sid, cohort=cohort, block=block,
            number=f'{cohort}-DENT-{n:04d}',
            year=year_level(cohort, 2026),
            admission=date(cohort, 8, 1),
            birthdate=date(cohort - 18 - R.choice([0, 0, 1]), R.randint(1, 12), R.randint(1, 28)),
            contact='09' + ''.join(str(R.randint(0, 9)) for _ in range(9)),
            ability=max(70.0, min(97.5, R.gauss(86.5, 4.8))),
            reliability=R.choice([0.97, 0.95, 0.93, 0.9, 0.86]),
            user_id=None, account_user_id=None, role=None,
        )
        students.append(s)
by_sid = {s['student_id']: s for s in students}

# Secretaries: one student per current block. secretary@ is fixed (student 24, cohort 2023 block B).
sec_user = {}  # (cohort, block) -> user_id
next_uid = 16
bea = by_sid[24]
bea['user_id'] = 9
bea['role'] = 'secretary'
sec_user[(2023, 'B')] = 9
for cohort in COHORTS:
    for block in 'AB':
        if (cohort, block) in sec_user:
            continue
        pool = [s for s in students if s['cohort'] == cohort and s['block'] == block
                and s['role'] is None and not s['email'].startswith('student@')]
        pick = sorted(pool, key=lambda s: -s['ability'])[1]  # a strong, organised student
        pick['user_id'] = next_uid
        pick['role'] = 'secretary'
        sec_user[(cohort, block)] = next_uid
        next_uid += 1
assert next_uid == 23

# student@ -> user 10
stud = next(s for s in students if s['email'].startswith('student@'))
stud['account_user_id'] = 10
# Legacy fixture id kept for tests/database/postgres_integration_test.php:
# the student@ account's Student row is student_id 26.
other26 = by_sid[26]
other26['student_id'], stud['student_id'] = stud['student_id'], 26
students.sort(key=lambda s: s['student_id'])
by_sid = {s['student_id']: s for s in students}
stud['role'] = 'student'

# Everyone else gets a student account, except six current first-years kept for invitation testing.
no_account = [s for s in students if s['cohort'] == 2026 and s['block'] == 'B' and s['role'] is None][-6:]
no_account_ids = {s['student_id'] for s in no_account}
uid = 23
for s in students:
    if s['role'] is None and s['student_id'] not in no_account_ids:
        s['account_user_id'] = uid
        s['role'] = 'student'
        uid += 1
LAST_UID = uid - 1

# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------
sections = []  # dict(key, cs_name, course, sy, sem, year, block, instructor, secretary, cohort)
rot = 0
for (sy, sem), (t0, t1) in TERMS.items():
    sy_start = int(sy[:4])
    for cohort in COHORTS:
        yl = year_level(cohort, sy_start)
        if yl < 1 or yl > 4:
            continue
        course = COURSE_FOR[(yl, sem)]
        for block in 'AB':
            name = f'{SECTION_PREFIX[course]}-{yl}{block}'
            key = (sy, sem, name)
            if sy == CURRENT_SY:
                instr = FAC[INSTRUCTOR[key]]
                secretary = sec_user[(cohort, block)]
            else:
                instr = FAC[PAST_ROTATION[rot % len(PAST_ROTATION)]]
                rot += 1
                secretary = None
            sections.append(dict(key=key, cs_name=name, course=course, sy=sy, sem=sem, year=yl, block=block,
                                 instructor=instr, secretary=secretary, cohort=cohort, start=t0, end=t1,
                                 lab=f'{LAB_ROOM[yl]} {block}', lec=f'Room {yl}0{1 if block == "A" else 2}',
                                 term_code=f'{sy_start}-{sem}', current=(sy == CURRENT_SY)))


def ckey(sec):
    return f"{sec['sy']}|{sec['sem']}|{sec['cs_name']}"


# ---------------------------------------------------------------------------
# Assessments, scores, attendance, grades
# ---------------------------------------------------------------------------
TOPICS = {
    'DENT101': ('Infection Control Protocols', 'Dental Jurisprudence', 'Instrument Identification', 'Ergonomics and Chairside Positioning'),
    'ANAT102': ('Osteology of the Skull', 'Cranial Nerves', 'Muscles of Mastication Dissection', 'Vascular Supply Mapping'),
    'ORAL201': ('Tooth Morphology', 'Enamel and Dentin Histology', 'Tooth Carving: Maxillary Incisor', 'Tooth Carving: Mandibular Molar'),
    'DMAT202': ('Gypsum Products', 'Dental Amalgam and Composites', 'Impression Material Manipulation', 'Die Stone Pouring'),
    'CLIN301': ('Edentulous Anatomy', 'Jaw Relation Records', 'Final Impression Practical', 'Denture Setup and Waxing'),
    'CLIN302': ('Periodontal Charting', 'Plaque Biofilm and Calculus', 'Scaling and Root Planing Practical', 'Periodontal Maintenance Case'),
    'CLIN401': ('Treatment Planning', 'Restorative Case Review', 'Class II Composite Restoration', 'Extraction Practicum'),
    'CLIN402': ('Crown and Bridge Principles', 'Pediatric Behaviour Management', 'Crown Preparation Practical', 'Pediatric Case Presentation'),
}


def assessment_plan(sec):
    t0, t1 = sec['start'], sec['end']
    q1, q2, l1, l2 = TOPICS[sec['course']]
    span = (t1 - t0).days
    d = lambda frac: t0 + timedelta(days=int(span * frac))
    return [
        ('Quiz 1: ' + q1, 'Quiz', 'Midterm', 50, 10, d(0.14)),
        ('Laboratory 1: ' + l1, 'Laboratory', 'Midterm', 100, 15, d(0.27)),
        ('Midterm Examination', 'Midterm Exam', 'Midterm', 100, 25, d(0.45)),
        ('Quiz 2: ' + q2, 'Quiz', 'Final', 50, 10, d(0.62)),
        ('Laboratory 2: ' + l2, 'Laboratory', 'Final', 100, 15, d(0.78)),
        ('Final Examination', 'Final Exam', 'Final', 100, 25, d(0.95)),
    ]


assessments = []   # (ckey, title, type, period, max, weight, due, status)
scores = []        # (ckey, title, student_number, score, submitted_at)
enrollments = []   # dict
att_sessions = []  # dict
att_records = []   # dict
remedials = []     # (ckey, student_number, attempt, scheduled, pct, outcome, actor)

WEEKDAY = {'A': 0, 'B': 2}  # Monday / Wednesday

for sec in sections:
    members = [s for s in students if s['cohort'] == sec['cohort'] and s['block'] == sec['block']]
    course = COURSE_BY[sec['course']]
    wq, we, wp, wa = course[7]
    plan = assessment_plan(sec)
    per_student = {s['number']: {'Quiz': [], 'Laboratory': [], 'Exam': []} for s in members}
    for title, typ, period, mx, w, due in plan:
        graded = due < TODAY
        status = 'Closed' if graded else 'Active'
        assessments.append((ckey(sec), title, typ, period, mx, w, due, status))
        if not graded:
            continue
        for s in members:
            spread = 7.0 if typ.endswith('Exam') else 5.0
            pct = max(48.0, min(100.0, R.gauss(s['ability'] + (1.5 if typ == 'Laboratory' else 0), spread)))
            raw = round(pct * mx / 100 * 2) / 2  # half-point scores
            scores.append((ckey(sec), title, s['number'], raw, utc(due, time(17, 0))))
            per_student[s['number']]['Exam' if typ.endswith('Exam') else typ].append(raw / mx * 100)

    # Attendance sessions: weekly, starting the second week, up to the day before "today".
    first = sec['start'] + timedelta(days=7)
    first += timedelta(days=(WEEKDAY[sec['block']] - first.weekday()) % 7)
    dates = [first + timedelta(weeks=i) for i in range(12)]
    dates = [d for d in dates if d < min(sec['end'], TODAY)][: (6 if sec['current'] else 10)]
    owner = sec['secretary'] if sec['current'] else sec['instructor']
    sess_list = []
    for d in dates:
        code = f"{sec['cs_name']}-{d.strftime('%Y%m%d')}"
        sess = dict(ckey=ckey(sec), code=code, date=d, owner=owner, room=sec['lec'],
                    started=utc(d, time(7, 55)), ended=utc(d, time(10, 0)))
        att_sessions.append(sess)
        sess_list.append(sess)

    att_by_student = {s['number']: [] for s in members}
    for sess in sess_list:
        for s in members:
            r = R.random()
            rel = s['reliability']
            if r < rel:
                st = 'present'
                t = time(8, R.randint(0, 14))
            elif r < rel + (1 - rel) * 0.5:
                st = 'late'
                t = time(8, R.randint(16, 29))
            elif r < rel + (1 - rel) * 0.8:
                st = 'absent'
                t = None
            else:
                st = 'excused'
                t = time(8, R.randint(0, 29))
            rec = dict(ckey=sess['ckey'], code=sess['code'], date=sess['date'], number=s['number'], status=st)
            if st == 'absent':
                rec.update(method='system_resolution', recorded=sess['ended'], reason=None, by=None, at=None)
            else:
                when = utc(sess['date'], t)
                if sec['current'] and st == 'excused':
                    # A real secretary override: the student was absent with a valid excuse.
                    at = sess['ended'] + timedelta(minutes=R.randint(5, 50))
                    rec.update(method='manual_secretary', recorded=sess['ended'],
                               reason='Excused: medical certificate submitted to the class secretary.', by=owner, at=at)
                elif sec['current']:
                    # Secretary-run sessions are normally face check-ins.
                    rec.update(method='biometric', recorded=when, reason=None, by=None, at=None)
                else:
                    reason = 'Excused: medical certificate on file.' if st == 'excused' else None
                    rec.update(method='manual_faculty', recorded=when, reason=reason, by=owner, at=when)
            att_records.append(rec)
            att_by_student[s['number']].append(st)

    for s in members:
        e = dict(ckey=ckey(sec), number=s['number'], date=sec['start'], final_pct=None, gwa=None,
                 components=None, retention='active',
                 hours=0)
        if course[6]:
            e['hours'] = R.randint(8, 30) if sec['current'] else R.randint(60, 120)
        if not sec['current']:
            ps = per_student[s['number']]
            quizzes = sum(ps['Quiz']) / len(ps['Quiz'])
            exams = sum(ps['Exam']) / len(ps['Exam'])
            practicum = sum(ps['Laboratory']) / len(ps['Laboratory'])
            pts = {'present': 100.0, 'excused': 100.0, 'late': 80.0, 'absent': 0.0}
            att = sum(pts[x] for x in att_by_student[s['number']]) / max(1, len(att_by_student[s['number']]))
            final = round((quizzes * wq + exams * we + practicum * wp + att * wa) / 100, 2)
            gwa = pct_to_gwa(final)
            e.update(final_pct=final, gwa=gwa, retention='remedial' if gwa >= 2.5 else 'active',
                     components={'quizzes': round(quizzes, 2), 'exams': round(exams, 2),
                                 'practicum': round(practicum, 2), 'attendance': round(att, 2)})
        enrollments.append(e)

# Remedial progressions for past remedial enrollments (canonical attempts only).
past_remedial = [e for e in enrollments if e['retention'] == 'remedial']
for i, e in enumerate(past_remedial):
    sec = next(x for x in sections if ckey(x) == e['ckey'])
    actor = sec['instructor']
    exam1 = sec['end'] + timedelta(days=21)
    exam2 = sec['end'] + timedelta(days=42)
    latest_term = sec['sy'] == '2025-2026' and sec['sem'] == '2ND'
    pattern = i % 5
    if latest_term:
        # Summer 2026 remedials: some still open so the Retention pages have live work.
        if pattern in (0, 1):
            continue  # flagged, no attempt recorded yet
        if pattern == 2:
            remedials.append((e['ckey'], e['number'], 1, date(2026, 10, 12), None, 'pending', actor))
            continue
        if pattern == 3:
            remedials.append((e['ckey'], e['number'], 1, date(2026, 7, 6), 41.0, 'failed', actor))
            remedials.append((e['ckey'], e['number'], 2, date(2026, 10, 19), None, 'pending', actor))
            continue
    if pattern in (0, 2, 4):
        remedials.append((e['ckey'], e['number'], 1, exam1, float(R.choice([72, 76, 81, 85])), 'passed', actor))
    elif pattern == 1:
        remedials.append((e['ckey'], e['number'], 1, exam1, float(R.choice([38, 44, 47])), 'failed', actor))
        remedials.append((e['ckey'], e['number'], 2, exam2, float(R.choice([70, 74, 79])), 'passed', actor))
    else:
        remedials.append((e['ckey'], e['number'], 1, exam1, float(R.choice([35, 42])), 'failed', actor))
        remedials.append((e['ckey'], e['number'], 2, exam2, float(R.choice([40, 46])), 'failed', actor))


# ---------------------------------------------------------------------------
# SQL output
# ---------------------------------------------------------------------------
def values_block(rows, width=None):
    return ',\n'.join('    (' + ', '.join(q(v) for v in r) + ')' for r in rows)


def jsonb(d):
    if d is None:
        return None
    import json
    return json.dumps(d, separators=(',', ':'))


def build_sql():
    out = []
    w = out.append
    w("""-- DentiSys PostgreSQL development demo seed (fictional data)
-- Generated deterministically. Do not hand-edit; regenerate instead.
-- Accounts and passwords: docs/demo-accounts.md
--
-- Load it with pgAdmin Query Tool (paste the whole file and execute) or psql:
--   docker compose cp database/seeds/development-demo.sql db:/tmp/development-demo.sql
--   docker compose exec -T db psql -U postgres -d dentisys -v ON_ERROR_STOP=1 -f /tmp/development-demo.sql
--
-- Safe to rerun: when the students table already has rows, nothing is inserted.
-- It never drops, truncates, updates, or deletes data and makes no schema changes.

BEGIN;

-- Run guard: the seed only loads into a database without students.
CREATE TEMP TABLE seed_run ON COMMIT DROP AS SELECT NOT EXISTS (SELECT 1 FROM students) AS go;
DO $guard$
BEGIN
    IF NOT (SELECT go FROM seed_run) THEN
        RAISE NOTICE 'DentiSys demo seed skipped: the students table already has rows.';
    END IF;
END
$guard$;
""")
    # ---- user accounts
    rows = []
    for (u, email, role, pre, fi, mi, la, su, title, status, created) in STAFF:
        disp = ' '.join(x for x in (pre, fi, mi, la) if x) + (', ' + su if su else '')
        approved = datetime.combine(created, time(1, 0)) if status == 'Active' else None
        rows.append((u, email + DOMAIN, HASH[role], role, disp, title, status, datetime.combine(created, time(1, 0)),
                     approved, pre, fi, mi, la, su))
    for s in sorted(students, key=lambda s: (s['user_id'] or s['account_user_id'] or 10**9)):
        u = s['user_id'] or s['account_user_id']
        if u is None:
            continue
        role = 'secretary' if s['user_id'] else 'student'
        created = datetime.combine(TERMS[(CURRENT_SY if role == 'secretary' else f"{s['cohort']}-{s['cohort'] + 1}", '1ST')][0]
                                   if s['cohort'] >= 2024 or role == 'secretary' else date(2024, 8, 12), time(1, 0))
        disp = ' '.join((s['first'], s['middle'], s['last']))
        title = 'Class Secretary' if role == 'secretary' else 'Student'
        rows.append((u, s['email'], HASH[role], role, disp, title, 'Active', created,
                     created if role == 'secretary' else None, None, s['first'], s['middle'], s['last'], None))
    rows.sort(key=lambda r: r[0])
    w('-- 1. Accounts (admin, faculty, secretaries, students). Existing e-mails are left untouched.')
    w('INSERT INTO user_accounts (user_id, login_email, password_hash, role, display_name, title, status, created_at, approved_at,')
    w('                           name_prefix, first_name, middle_name, last_name, name_suffix)')
    w('SELECT v.user_id::integer, v.login_email, v.password_hash, v.role, v.display_name, v.title, v.status,')
    w('       v.created_at::timestamp, v.approved_at::timestamp, v.name_prefix, v.first_name, v.middle_name, v.last_name, v.name_suffix')
    w('FROM (VALUES')
    w(values_block(rows))
    w(') AS v(user_id, login_email, password_hash, role, display_name, title, status, created_at, approved_at,')
    w('       name_prefix, first_name, middle_name, last_name, name_suffix)')
    w('WHERE (SELECT go FROM seed_run)')
    w('  AND NOT EXISTS (SELECT 1 FROM user_accounts ua WHERE ua.login_email = v.login_email::citext)')
    w('  AND NOT EXISTS (SELECT 1 FROM user_accounts ua WHERE ua.user_id = v.user_id);')
    w('')
    # user_accounts VALUES types: cast first row via explicit casts is needed for NULL columns
    # ---- courses
    w('-- 2. Course catalogue')
    w('INSERT INTO courses (course_code, name, units, year_level, semester, description, is_clinical, grading_config)')
    w('SELECT v.course_code, v.name, v.units::numeric, v.year_level::smallint, v.semester, v.description, v.is_clinical::smallint, v.grading_config::jsonb')
    w('FROM (VALUES')
    crow = []
    for c in COURSES:
        gq, ge, gp, ga = c[7]
        crow.append((c[0], c[1], c[2], c[3], c[4], c[5], c[6], jsonb({'quizzes': gq, 'exams': ge, 'practicum': gp, 'attendance': ga})))
    w(values_block(crow))
    w(') AS v(course_code, name, units, year_level, semester, description, is_clinical, grading_config)')
    w('WHERE (SELECT go FROM seed_run)')
    w('ON CONFLICT (course_code) DO NOTHING;')
    w('')
    # ---- students
    w('-- 3. Students (explicit ids; student 24 is the secretary@ student, kept for integration tests)')
    w('INSERT INTO students (student_id, student_number, first_name, middle_name, last_name, bu_email, contact, sex,')
    w('                      year_level, status, admission_date, birthdate, user_id, student_account_user_id)')
    w('SELECT v.student_id::integer, v.student_number, v.first_name, v.middle_name, v.last_name, v.bu_email::citext, v.contact, v.sex,')
    w('       v.year_level::smallint, v.status, v.admission_date::date, v.birthdate::date, v.user_id::integer, v.student_account_user_id::integer')
    w('FROM (VALUES')
    srow = [(s['student_id'], s['number'], s['first'], s['middle'], s['last'], s['email'], s['contact'], s['sex'],
             s['year'], 'active', s['admission'], s['birthdate'], s['user_id'], s['account_user_id']) for s in students]
    w(values_block(srow))
    w(') AS v(student_id, student_number, first_name, middle_name, last_name, bu_email, contact, sex,')
    w('       year_level, status, admission_date, birthdate, user_id, student_account_user_id)')
    w('WHERE (SELECT go FROM seed_run);')
    w('')
    # ---- sections
    w('-- 4. Class sections (current school year ' + CURRENT_SY + ' plus two past years)')
    w('CREATE TEMP TABLE seed_cs (ckey text PRIMARY KEY, cs_id integer NOT NULL) ON COMMIT DROP;')
    w('WITH v(ord, ckey, cs_name, course_code, instructor_user_id, secretary_user_id, semester, school_year, year_level,')
    w('       lab_room, lec_room, block, term_code, term_start_date, term_end_date) AS (VALUES')
    rows = [(i, ckey(s), s['cs_name'], s['course'], s['instructor'], s['secretary'], s['sem'], s['sy'], s['year'],
             s['lab'], s['lec'], s['block'], s['term_code'], s['start'], s['end']) for i, s in enumerate(sections, 1)]
    rows_sql = values_block(rows)
    w(rows_sql)
    w('), ins AS (')
    w('    INSERT INTO class_sections (cs_name, course_id, instructor_user_id, secretary_user_id, semester, school_year,')
    w('                                year_level, lab_room, lec_room, block, status, term_code, term_start_date, term_end_date)')
    w("    SELECT v.cs_name, c.course_id, v.instructor_user_id::integer,")
    w('           v.secretary_user_id::integer, v.semester, v.school_year, v.year_level::smallint, v.lab_room, v.lec_room, v.block,')
    w("           'Active', v.term_code, v.term_start_date::date, v.term_end_date::date")
    w('      FROM v JOIN courses c ON c.course_code = v.course_code')
    w('     WHERE (SELECT go FROM seed_run)')
    w('     ORDER BY v.ord')
    w('    RETURNING cs_id, cs_name, school_year, semester')
    w(')')
    w("INSERT INTO seed_cs SELECT school_year || '|' || semester || '|' || cs_name, cs_id FROM ins;")
    w('')
    # ---- enrollments
    w('-- 5. Enrollments. Past years carry final grades; the current term is still pending evaluation.')
    w('CREATE TEMP TABLE seed_enr (ckey text, student_number text, enrollment_id integer, PRIMARY KEY (ckey, student_number)) ON COMMIT DROP;')
    w('WITH v(ord, ckey, student_number, date_enrolled, final_percentage, final_gwa, grade_components_json, retention_state, clinic_hours_completed) AS (VALUES')
    rows = [(i, e['ckey'], e['number'], e['date'], e['final_pct'], e['gwa'], jsonb(e['components']), e['retention'], e['hours'])
            for i, e in enumerate(enrollments, 1)]
    w(values_block(rows))
    w('), ins AS (')
    w('    INSERT INTO enrollments (student_id, cs_id, status, date_enrolled, final_percentage, final_gwa,')
    w('                             grade_components_json, retention_state, clinic_hours_completed)')
    w("    SELECT s.student_id, sc.cs_id, 'Active', v.date_enrolled::date, v.final_percentage::numeric, v.final_gwa::numeric,")
    w('           v.grade_components_json::jsonb, v.retention_state, v.clinic_hours_completed::integer')
    w('      FROM v JOIN seed_cs sc ON sc.ckey = v.ckey JOIN students s ON s.student_number = v.student_number ORDER BY v.ord')
    w('    RETURNING enrollment_id, student_id, cs_id')
    w(')')
    w('INSERT INTO seed_enr SELECT sc.ckey, s.student_number, ins.enrollment_id')
    w('  FROM ins JOIN seed_cs sc ON sc.cs_id = ins.cs_id JOIN students s ON s.student_id = ins.student_id;')
    w('')
    # ---- assessments
    w('-- 6. Assessments and scores')
    w('CREATE TEMP TABLE seed_asm (ckey text, title text, assessment_id integer, PRIMARY KEY (ckey, title)) ON COMMIT DROP;')
    w('WITH v(ord, ckey, title, type, grading_period, max_score, weight, due_date, status) AS (VALUES')
    w(values_block([(i,) + a for i, a in enumerate(assessments, 1)]))
    w('), ins AS (')
    w('    INSERT INTO assessments (cs_id, title, type, grading_period, max_score, weight, due_date, status)')
    w('    SELECT sc.cs_id, v.title, v.type, v.grading_period, v.max_score::numeric, v.weight::numeric, v.due_date::date, v.status')
    w('      FROM v JOIN seed_cs sc ON sc.ckey = v.ckey ORDER BY v.ord')
    w('    RETURNING assessment_id, cs_id, title')
    w(')')
    w('INSERT INTO seed_asm SELECT sc.ckey, ins.title, ins.assessment_id FROM ins JOIN seed_cs sc ON sc.cs_id = ins.cs_id;')
    w('')
    w('INSERT INTO assessment_scores (assessment_id, student_id, score, submitted_at)')
    w('SELECT a.assessment_id, s.student_id, v.score::numeric, v.submitted_at::timestamp')
    w('FROM (VALUES')
    w(values_block(scores))
    w(') AS v(ckey, title, student_number, score, submitted_at)')
    w('JOIN seed_asm a ON a.ckey = v.ckey AND a.title = v.title')
    w('JOIN students s ON s.student_number = v.student_number;')
    w('')
    # ---- attendance
    w('-- 7. Attendance sessions (all ended) and their records. Timestamps are UTC.')
    w('CREATE TEMP TABLE seed_sess (ckey text, session_code text, session_id integer, PRIMARY KEY (ckey, session_code)) ON COMMIT DROP;')
    w('WITH v(ord, ckey, session_code, session_date, owner_user_id, room, started_at, ended_at) AS (VALUES')
    w(values_block([(i, x['ckey'], x['code'], x['date'], x['owner'], x['room'], x['started'], x['ended']) for i, x in enumerate(att_sessions, 1)]))
    w('), ins AS (')
    w('    INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, room,')
    w('                                     started_at, ended_at, status, geofence_enabled, biometric_required,')
    w('                                     opening_time, present_cutoff_time, late_cutoff_time, created_at, updated_at)')
    w('    SELECT sc.cs_id, v.owner_user_id::integer, v.owner_user_id::integer, v.session_date::date, v.session_code, v.room,')
    w("           v.started_at::timestamp, v.ended_at::timestamp, 'ended', FALSE, FALSE,")
    w("           TIME '08:00', TIME '08:15', TIME '08:30', v.started_at::timestamp, v.ended_at::timestamp")
    w('      FROM v JOIN seed_cs sc ON sc.ckey = v.ckey ORDER BY v.ord')
    w('    RETURNING session_id, cs_id, session_code')
    w(')')
    w('INSERT INTO seed_sess SELECT sc.ckey, ins.session_code, ins.session_id FROM ins JOIN seed_cs sc ON sc.cs_id = ins.cs_id;')
    w('')
    w('INSERT INTO attendance_records (enrollment_id, attendance_session_id, session_date, session_code, session_start, session_end,')
    w('                                status, verification_method, override_reason, override_by_user_id, override_at, time_recorded, created_at)')
    w("SELECT e.enrollment_id, ss.session_id, v.session_date::date, v.session_code, TIME '08:00', TIME '08:30',")
    w('       v.status, v.method, v.reason, v.by_user::integer, v.at::timestamp, v.recorded::timestamp, v.recorded::timestamp')
    w('FROM (VALUES')
    w(values_block([(r['ckey'], r['code'], r['date'], r['number'], r['status'], r['method'], r['reason'], r['by'], r['at'], r['recorded'])
                    for r in att_records]))
    w(') AS v(ckey, session_code, session_date, student_number, status, method, reason, by_user, at, recorded)')
    w('JOIN seed_sess ss ON ss.ckey = v.ckey AND ss.session_code = v.session_code')
    w('JOIN seed_enr e ON e.ckey = v.ckey AND e.student_number = v.student_number;')
    w('')
    # ---- remedials
    w('-- 8. Remedial attempt progressions for past remedial enrollments')
    w('INSERT INTO enrollment_remedial_attempts (enrollment_id, attempt_number, scheduled_date, percentage, outcome, actor_user_id)')
    w('SELECT e.enrollment_id, v.attempt_number::smallint, v.scheduled_date::date, v.percentage::numeric, v.outcome, v.actor::integer')
    w('FROM (VALUES')
    w(values_block(remedials))
    w(') AS v(ckey, student_number, attempt_number, scheduled_date, percentage, outcome, actor)')
    w('JOIN seed_enr e ON e.ckey = v.ckey AND e.student_number = v.student_number;')
    w('')
    w('-- 9. Keep identity sequences ahead of the explicit ids')
    w('DO $seq$')
    w('BEGIN')
    for t, c in (('user_accounts', 'user_id'), ('students', 'student_id'), ('courses', 'course_id'),
                 ('class_sections', 'cs_id'), ('enrollments', 'enrollment_id'), ('assessments', 'assessment_id'),
                 ('assessment_scores', 'score_id'), ('attendance_sessions', 'session_id'),
                 ('attendance_records', 'record_id'), ('enrollment_remedial_attempts', 'remedial_attempt_id')):
        w(f"    PERFORM setval(pg_get_serial_sequence('{t}', '{c}'), GREATEST((SELECT COALESCE(MAX({c}), 1) FROM {t}), 1), true);")
    w('END')
    w('$seq$;')
    w('')
    w('COMMIT;')

    return '\n'.join(out) + '\n'


def build_md():
    L = []
    w = L.append
    w('# Demo accounts (development and test only)')
    w('')
    w('These accounts are created by `database/seeds/development-demo.sql`. All people and records are fictional.')
    w('Use them only on a local development or disposable test stack — never on a server reachable by real users.')
    w('')
    w('| Role | Password |')
    w('|---|---|')
    for r in ('admin', 'faculty', 'secretary', 'student'):
        w(f'| {r.capitalize()} | `{PASSWORD[r]}` |')
    w('')
    w('Every account of a role uses that role\'s password. Current school year in the seed: **' + CURRENT_SY + '**, 1st semester.')
    w('')
    w('## Quick logins')
    w('')
    w('| Role | E-mail | Notes |')
    w('|---|---|---|')
    w(f'| Admin | `admin@{DOMAIN}` | Dean (admin pages only) |')
    w(f'| Faculty | `faculty@{DOMAIN}` | Teaches CLINIC-4A and CLINIC-4B this year, plus past sections |')
    w(f'| Secretary | `secretary@{DOMAIN}` | Bea Mercado Alonzo, class secretary of CLINIC-4B (4th year, block B) |')
    w(f'| Student | `student@{DOMAIN}` | Juan Miguel Reyes Dela Cruz, 1st year, DENT-1A |')
    w('')
    w('## Admin and faculty')
    w('')
    w('| E-mail | Name | Title | Status | Current classes (' + CURRENT_SY + ') |')
    w('|---|---|---|---|---|')
    cur = {}
    for s in sections:
        if s['current']:
            cur.setdefault(s['instructor'], []).append(s['cs_name'])
    for (u, email, role, pre, fi, mi, la, su, title, status, _) in STAFF:
        name = ' '.join(x for x in (pre, fi, mi, la) if x) + (', ' + su if su else '')
        classes = ', '.join(cur.get(u, [])) or ('—' if role == 'faculty' else 'n/a')
        w(f'| `{email}{DOMAIN}` | {name} | {title} | {status} | {classes} |')
    w('')
    w('The two *Pending Approval* faculty rows are inactive legacy applicants. They cannot sign in and are never activated automatically; an Admin must issue a new invitation from **Faculty Invitations**. Faculty without a current class (—) taught only in past school years; use the dashboard school-year filter to see their classes.')
    w('')
    w('## Class secretaries (password `Secretary123!`)')
    w('')
    w('Each secretary is also a student of the section they manage.')
    w('')
    w('| E-mail | Name | Student no. | Section (' + CURRENT_SY + ') |')
    w('|---|---|---|---|')
    for s in sorted([s for s in students if s['user_id']], key=lambda s: (-s['year'], s['block'])):
        sec = next(x for x in sections if x['current'] and x['secretary'] == s['user_id'])
        w(f"| `{s['email']}` | {s['first']} {s['middle']} {s['last']} | {s['number']} | {sec['cs_name']} |")
    w('')
    w('## Students (password `Student123!`)')
    w('')
    w('Student numbers are `<admission year>-DENT-<nnnn>`. Year level is for ' + CURRENT_SY + '.')
    w('')
    w('| E-mail | Name | Student no. | Year | Block | Current section |')
    w('|---|---|---|---|---|---|')
    for s in students:
        if s['role'] != 'student':
            continue
        sec = next(x for x in sections if x['current'] and x['cohort'] == s['cohort'] and x['block'] == s['block'])
        w(f"| `{s['email']}` | {s['first']} {s['middle']} {s['last']} | {s['number']} | {s['year']} | {s['block']} | {sec['cs_name']} |")
    w('')
    w('## Students without an account (for invitation testing)')
    w('')
    w('These current first-year students have no login yet. Faculty can send them an invitation from Classes & Rosters; the invitation e-mail arrives in Mailpit.')
    w('')
    w('| Institutional e-mail | Name | Student no. | Section |')
    w('|---|---|---|---|')
    for s in students:
        if s['student_id'] in no_account_ids:
            w(f"| `{s['email']}` | {s['first']} {s['middle']} {s['last']} | {s['number']} | DENT-1B |")
    w('')
    w('## What the data contains')
    w('')
    n_past = sum(1 for s in sections if not s['current'])
    w(f'- {len(COURSES)} courses, {len(sections)} class sections ({len(sections) - n_past} in {CURRENT_SY}, {n_past} in 2024-2025 and 2025-2026).')
    w(f'- {len(students)} students in four cohorts (admitted 2023–2026), two blocks of 15 per cohort.')
    w(f'- {len(enrollments)} enrollments, {len(assessments)} assessments, {len(scores)} scores, {len(att_sessions)} attendance sessions, {len(att_records)} attendance records.')
    rem = sum(1 for e in enrollments if e['retention'] == 'remedial')
    w(f'- Past enrollments have final grades; {rem} are flagged for remedial, with {len(remedials)} recorded remedial attempts (passed, failed, cost recovery, and upcoming).')
    w(f'- Current-year enrollments have quiz and laboratory scores only, so their grades show *Pending evaluation*.')
    w('- Current-term check-ins are stored as biometric attendance history, but **no face (biometric) profiles are seeded**: every student or secretary must complete Face Registration before a new biometric check-in. Notifications and audit events are not seeded.')
    w('')
    w('Regenerate this file and the seed together; do not edit them by hand.')
    return '\n'.join(L) + '\n'


if __name__ == '__main__':
    open(sys.argv[1], 'w').write(build_sql())
    open(sys.argv[2], 'w').write(build_md())
    print('students', len(students), 'accounts up to', LAST_UID, 'sections', len(sections), 'enrollments', len(enrollments),
          'assessments', len(assessments), 'scores', len(scores), 'sessions', len(att_sessions), 'records', len(att_records),
          'remedial_enr', len(past_remedial), 'attempts', len(remedials))
