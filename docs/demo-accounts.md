# Demo accounts (development and test only)

These accounts are created by `database/seeds/development-demo.sql`. All people and records are fictional.
Use them only on a local development or disposable test stack — never on a server reachable by real users.

| Role | Password |
|---|---|
| Admin | `Admin123!` |
| Faculty | `Faculty123!` |
| Secretary | `Secretary123!` |
| Student | `Student123!` |

Every account of a role uses that role's password. Current school year in the seed: **2026-2027**, 1st semester.

## Quick logins

| Role | E-mail | Notes |
|---|---|---|
| Admin | `admin@bicol-u.edu.ph` | Dean (admin pages only) |
| Faculty | `faculty@bicol-u.edu.ph` | Teaches CLINIC-4A and CLINIC-4B this year, plus past sections |
| Secretary | `secretary@bicol-u.edu.ph` | Bea Mercado Alonzo, class secretary of CLINIC-4B (4th year, block B) |
| Student | `student@bicol-u.edu.ph` | Juan Miguel Reyes Dela Cruz, 1st year, DENT-1A |

## Admin and faculty

| E-mail | Name | Title | Status | Current classes (2026-2027) |
|---|---|---|---|---|
| `admin@bicol-u.edu.ph` | Dr. Maria Villareal Santos, DMD, PhD | Dean, College of Dental Medicine | Active | n/a |
| `faculty@bicol-u.edu.ph` | Dr. Roberto Lim Santos, DMD | Department Chair, Restorative Dentistry | Active | CLINIC-4A, CLINIC-4B |
| `dr.reyes@bicol-u.edu.ph` | Dr. Angela Marquez Reyes, DMD, MSc | Associate Professor, Periodontics | Active | PROSTHO-3B |
| `dr.cruz@bicol-u.edu.ph` | Dr. Fernando Ocampo Cruz, DMD | Clinical Instructor, Prosthodontics | Active | PROSTHO-3A |
| `dr.aquino@bicol-u.edu.ph` | Dr. Patricia Salazar Aquino, DMD | Lecturer, Oral Anatomy | Active | ORAL-2A |
| `dr.torres@bicol-u.edu.ph` | Dr. Ramon Dizon Torres, DMD | Lecturer, Ethics and Practice Management | Active | DENT-1A |
| `dr.mendoza@bicol-u.edu.ph` | Dr. Jessica Lorenzo Mendoza, DMD | Dental Faculty Member | Pending Activation | — |
| `dr.navarro@bicol-u.edu.ph` | Dr. Gabriel Soriano Navarro, DMD | Dental Faculty Member | Pending Activation | — |
| `dr.bautista@bicol-u.edu.ph` | Dr. Carmela Ramos Bautista, DMD | Assistant Professor, Oral Medicine | Active | — |
| `dr.villanueva@bicol-u.edu.ph` | Dr. Enrique Pascual Villanueva, DMD, MPH | Associate Professor, Community Dentistry | Active | — |
| `dr.delrosario@bicol-u.edu.ph` | Dr. Kristine Abad Del Rosario, DMD | Clinical Instructor, Pediatric Dentistry | Active | DENT-1B |
| `dr.garcia@bicol-u.edu.ph` | Dr. Antonio Manalo Garcia, DMD, MS | Professor, Oral and Maxillofacial Surgery | Active | — |
| `dr.lopez@bicol-u.edu.ph` | Dr. Rowena Tan Lopez, DMD | Instructor, Dental Materials | Active | ORAL-2B |

The two *Pending Activation* faculty rows are Dean invitations: `dr.mendoza@` is pending (issued when the seed loads, valid 7 days) and `dr.navarro@` has expired. They cannot sign in until they accept. The seeded links cannot be accepted; reissue the invitation from **Faculty Invitations** and open the link in Mailpit. Faculty without a current class (—) taught only in past school years; use the dashboard school-year filter to see their classes.

## Class secretaries (password `Secretary123!`)

Each secretary is also a student of the section they manage.

| E-mail | Name | Student no. | Section (2026-2027) |
|---|---|---|---|
| `alyssa.clemente@bicol-u.edu.ph` | Alyssa Fernandez Clemente | 2023-DENT-0003 | CLINIC-4A |
| `secretary@bicol-u.edu.ph` | Bea Mercado Alonzo | 2023-DENT-0024 | CLINIC-4B |
| `gwyneth.nepomuceno@bicol-u.edu.ph` | Gwyneth Belmonte Nepomuceno | 2024-DENT-0006 | PROSTHO-3A |
| `joshua.cortez@bicol-u.edu.ph` | Joshua Abad Cortez | 2024-DENT-0016 | PROSTHO-3B |
| `regine.yap@bicol-u.edu.ph` | Regine Lagman Yap | 2025-DENT-0011 | ORAL-2A |
| `patrick.fajardo@bicol-u.edu.ph` | Patrick Serrano Fajardo | 2025-DENT-0016 | ORAL-2B |
| `clarisse.buenaventura@bicol-u.edu.ph` | Clarisse Feliciano Buenaventura | 2026-DENT-0007 | DENT-1A |
| `gabriel.yap@bicol-u.edu.ph` | Gabriel Esteban Yap | 2026-DENT-0020 | DENT-1B |

## Students (password `Student123!`)

Student numbers are `<admission year>-DENT-<nnnn>`. Year level is for 2026-2027.

| E-mail | Name | Student no. | Year | Block | Current section |
|---|---|---|---|---|---|
| `markanthony.hernandez@bicol-u.edu.ph` | Mark Anthony Castro Hernandez | 2023-DENT-0001 | 4 | A | CLINIC-4A |
| `rodel.agustin@bicol-u.edu.ph` | Rodel Perez Agustin | 2023-DENT-0002 | 4 | A | CLINIC-4A |
| `ralph.nicolas@bicol-u.edu.ph` | Ralph Borja Nicolas | 2023-DENT-0004 | 4 | A | CLINIC-4A |
| `edgar.ortega@bicol-u.edu.ph` | Edgar Valenzuela Ortega | 2023-DENT-0005 | 4 | A | CLINIC-4A |
| `markanthony.agustin@bicol-u.edu.ph` | Mark Anthony Castro Agustin | 2023-DENT-0006 | 4 | A | CLINIC-4A |
| `benedict.obispo@bicol-u.edu.ph` | Benedict Luna Obispo | 2023-DENT-0007 | 4 | A | CLINIC-4A |
| `regine.luna@bicol-u.edu.ph` | Regine Francisco Luna | 2023-DENT-0008 | 4 | A | CLINIC-4A |
| `stephanie.tuazon@bicol-u.edu.ph` | Stephanie Evangelista Tuazon | 2023-DENT-0009 | 4 | A | CLINIC-4A |
| `andrei.enriquez@bicol-u.edu.ph` | Andrei De Leon Enriquez | 2023-DENT-0010 | 4 | A | CLINIC-4A |
| `ryan.sabado@bicol-u.edu.ph` | Ryan Evangelista Sabado | 2023-DENT-0011 | 4 | A | CLINIC-4A |
| `gwyneth.rosales@bicol-u.edu.ph` | Gwyneth Quiambao Rosales | 2023-DENT-0012 | 4 | A | CLINIC-4A |
| `emmanuel.lagman@bicol-u.edu.ph` | Emmanuel Cortez Lagman | 2023-DENT-0013 | 4 | A | CLINIC-4A |
| `bianca.morales@bicol-u.edu.ph` | Bianca Nuñez Morales | 2023-DENT-0014 | 4 | A | CLINIC-4A |
| `ralph.borja@bicol-u.edu.ph` | Ralph Dimaculangan Borja | 2023-DENT-0015 | 4 | A | CLINIC-4A |
| `francis.alcantara@bicol-u.edu.ph` | Francis Manansala Alcantara | 2023-DENT-0016 | 4 | B | CLINIC-4B |
| `xavier.umali@bicol-u.edu.ph` | Xavier Marasigan Umali | 2023-DENT-0017 | 4 | B | CLINIC-4B |
| `pauline.llanes@bicol-u.edu.ph` | Pauline Castro Llanes | 2023-DENT-0018 | 4 | B | CLINIC-4B |
| `emmanuel.valenzuela@bicol-u.edu.ph` | Emmanuel Castillo Valenzuela | 2023-DENT-0019 | 4 | B | CLINIC-4B |
| `hazel.diaz@bicol-u.edu.ph` | Hazel Balagtas Diaz | 2023-DENT-0020 | 4 | B | CLINIC-4B |
| `tristan.feliciano@bicol-u.edu.ph` | Tristan Gonzales Feliciano | 2023-DENT-0021 | 4 | B | CLINIC-4B |
| `kristel.delapaz@bicol-u.edu.ph` | Kristel Nicolas Dela Paz | 2023-DENT-0022 | 4 | B | CLINIC-4B |
| `christine.cabrera@bicol-u.edu.ph` | Christine Manansala Cabrera | 2023-DENT-0023 | 4 | B | CLINIC-4B |
| `bryan.llanes@bicol-u.edu.ph` | Bryan Zamora Llanes | 2023-DENT-0025 | 4 | B | CLINIC-4B |
| `student@bicol-u.edu.ph` | Juan Miguel Reyes Dela Cruz | 2026-DENT-0001 | 1 | A | DENT-1A |
| `gwyneth.ignacio@bicol-u.edu.ph` | Gwyneth Espiritu Ignacio | 2023-DENT-0027 | 4 | B | CLINIC-4B |
| `zachary.cabrera@bicol-u.edu.ph` | Zachary Arevalo Cabrera | 2023-DENT-0028 | 4 | B | CLINIC-4B |
| `jericho.macaraeg@bicol-u.edu.ph` | Jericho Yap Macaraeg | 2023-DENT-0029 | 4 | B | CLINIC-4B |
| `carmina.gutierrez@bicol-u.edu.ph` | Carmina Gonzales Gutierrez | 2023-DENT-0030 | 4 | B | CLINIC-4B |
| `bianca.agustin@bicol-u.edu.ph` | Bianca Quiambao Agustin | 2024-DENT-0001 | 3 | A | PROSTHO-3A |
| `regine.quizon@bicol-u.edu.ph` | Regine Esteban Quizon | 2024-DENT-0002 | 3 | A | PROSTHO-3A |
| `katrina.quiambao@bicol-u.edu.ph` | Katrina Manansala Quiambao | 2024-DENT-0003 | 3 | A | PROSTHO-3A |
| `rafael.macaraeg@bicol-u.edu.ph` | Rafael Fernandez Macaraeg | 2024-DENT-0004 | 3 | A | PROSTHO-3A |
| `emmanuel.serrano@bicol-u.edu.ph` | Emmanuel Flores Serrano | 2024-DENT-0005 | 3 | A | PROSTHO-3A |
| `rica.feliciano@bicol-u.edu.ph` | Rica Esteban Feliciano | 2024-DENT-0007 | 3 | A | PROSTHO-3A |
| `veronica.perez@bicol-u.edu.ph` | Veronica Tolentino Perez | 2024-DENT-0008 | 3 | A | PROSTHO-3A |
| `harold.vergara@bicol-u.edu.ph` | Harold Gutierrez Vergara | 2024-DENT-0009 | 3 | A | PROSTHO-3A |
| `samantha.sabado@bicol-u.edu.ph` | Samantha Ortega Sabado | 2024-DENT-0010 | 3 | A | PROSTHO-3A |
| `francis.ortega@bicol-u.edu.ph` | Francis Yap Ortega | 2024-DENT-0011 | 3 | A | PROSTHO-3A |
| `rodel.panganiban@bicol-u.edu.ph` | Rodel Domingo Panganiban | 2024-DENT-0012 | 3 | A | PROSTHO-3A |
| `andrei.sanjose@bicol-u.edu.ph` | Andrei Balagtas San Jose | 2024-DENT-0013 | 3 | A | PROSTHO-3A |
| `elijah.gonzales@bicol-u.edu.ph` | Elijah Magbanua Gonzales | 2024-DENT-0014 | 3 | A | PROSTHO-3A |
| `earl.ignacio@bicol-u.edu.ph` | Earl Valdez Ignacio | 2024-DENT-0015 | 3 | A | PROSTHO-3A |
| `elaine.samonte@bicol-u.edu.ph` | Elaine Buenaventura Samonte | 2024-DENT-0017 | 3 | B | PROSTHO-3B |
| `elijah.calleja@bicol-u.edu.ph` | Elijah Guevarra Calleja | 2024-DENT-0018 | 3 | B | PROSTHO-3B |
| `harold.francisco@bicol-u.edu.ph` | Harold Nicolas Francisco | 2024-DENT-0019 | 3 | B | PROSTHO-3B |
| `elijah.corpuz@bicol-u.edu.ph` | Elijah Malabanan Corpuz | 2024-DENT-0020 | 3 | B | PROSTHO-3B |
| `abigail.umali@bicol-u.edu.ph` | Abigail Escobar Umali | 2024-DENT-0021 | 3 | B | PROSTHO-3B |
| `gerald.olivares@bicol-u.edu.ph` | Gerald Nepomuceno Olivares | 2024-DENT-0022 | 3 | B | PROSTHO-3B |
| `jasmine.umali@bicol-u.edu.ph` | Jasmine Tolentino Umali | 2024-DENT-0023 | 3 | B | PROSTHO-3B |
| `samantha.castillo@bicol-u.edu.ph` | Samantha Borja Castillo | 2024-DENT-0024 | 3 | B | PROSTHO-3B |
| `clarisse.arevalo@bicol-u.edu.ph` | Clarisse Robles Arevalo | 2024-DENT-0025 | 3 | B | PROSTHO-3B |
| `adrian.tolentino@bicol-u.edu.ph` | Adrian Vergara Tolentino | 2024-DENT-0026 | 3 | B | PROSTHO-3B |
| `xavier.mercado@bicol-u.edu.ph` | Xavier Lagman Mercado | 2024-DENT-0027 | 3 | B | PROSTHO-3B |
| `renz.tuazon@bicol-u.edu.ph` | Renz Yap Tuazon | 2024-DENT-0028 | 3 | B | PROSTHO-3B |
| `rodel.quiambao@bicol-u.edu.ph` | Rodel Villafuerte Quiambao | 2024-DENT-0029 | 3 | B | PROSTHO-3B |
| `xavier.ignacio@bicol-u.edu.ph` | Xavier Nuñez Ignacio | 2024-DENT-0030 | 3 | B | PROSTHO-3B |
| `vincent.hernandez@bicol-u.edu.ph` | Vincent Manansala Hernandez | 2025-DENT-0001 | 2 | A | ORAL-2A |
| `katrina.belmonte@bicol-u.edu.ph` | Katrina Escobar Belmonte | 2025-DENT-0002 | 2 | A | ORAL-2A |
| `rachelle.bernal@bicol-u.edu.ph` | Rachelle Valenzuela Bernal | 2025-DENT-0003 | 2 | A | ORAL-2A |
| `lara.tuazon@bicol-u.edu.ph` | Lara Valenzuela Tuazon | 2025-DENT-0004 | 2 | A | ORAL-2A |
| `bianca.valenzuela@bicol-u.edu.ph` | Bianca Cortez Valenzuela | 2025-DENT-0005 | 2 | A | ORAL-2A |
| `carmina.olivares@bicol-u.edu.ph` | Carmina Malabanan Olivares | 2025-DENT-0006 | 2 | A | ORAL-2A |
| `angelo.lacson@bicol-u.edu.ph` | Angelo Magbanua Lacson | 2025-DENT-0007 | 2 | A | ORAL-2A |
| `bryan.serrano@bicol-u.edu.ph` | Bryan Marasigan Serrano | 2025-DENT-0008 | 2 | A | ORAL-2A |
| `erika.hernandez@bicol-u.edu.ph` | Erika Calleja Hernandez | 2025-DENT-0009 | 2 | A | ORAL-2A |
| `katrina.fernandez@bicol-u.edu.ph` | Katrina De Guzman Fernandez | 2025-DENT-0010 | 2 | A | ORAL-2A |
| `elijah.borja@bicol-u.edu.ph` | Elijah Valenzuela Borja | 2025-DENT-0012 | 2 | A | ORAL-2A |
| `kenneth.manansala@bicol-u.edu.ph` | Kenneth Cortez Manansala | 2025-DENT-0013 | 2 | A | ORAL-2A |
| `danica.padilla@bicol-u.edu.ph` | Danica San Jose Padilla | 2025-DENT-0014 | 2 | A | ORAL-2A |
| `bryan.valdez@bicol-u.edu.ph` | Bryan Barrameda Valdez | 2025-DENT-0015 | 2 | A | ORAL-2A |
| `joanna.abad@bicol-u.edu.ph` | Joanna Panganiban Abad | 2025-DENT-0017 | 2 | B | ORAL-2B |
| `abigail.lacson@bicol-u.edu.ph` | Abigail San Jose Lacson | 2025-DENT-0018 | 2 | B | ORAL-2B |
| `rafael.padilla@bicol-u.edu.ph` | Rafael Gonzales Padilla | 2025-DENT-0019 | 2 | B | ORAL-2B |
| `sofia.nicolas@bicol-u.edu.ph` | Sofia Pangilinan Nicolas | 2025-DENT-0020 | 2 | B | ORAL-2B |
| `diana.fajardo@bicol-u.edu.ph` | Diana Santiago Fajardo | 2025-DENT-0021 | 2 | B | ORAL-2B |
| `hazel.pangilinan@bicol-u.edu.ph` | Hazel Vergara Pangilinan | 2025-DENT-0022 | 2 | B | ORAL-2B |
| `kimberly.serrano@bicol-u.edu.ph` | Kimberly De Leon Serrano | 2025-DENT-0023 | 2 | B | ORAL-2B |
| `samantha.padilla@bicol-u.edu.ph` | Samantha Ortega Padilla | 2025-DENT-0024 | 2 | B | ORAL-2B |
| `earl.valdez@bicol-u.edu.ph` | Earl Medina Valdez | 2025-DENT-0025 | 2 | B | ORAL-2B |
| `diana.macaraeg@bicol-u.edu.ph` | Diana Jimenez Macaraeg | 2025-DENT-0026 | 2 | B | ORAL-2B |
| `joanna.ortega@bicol-u.edu.ph` | Joanna Flores Ortega | 2025-DENT-0027 | 2 | B | ORAL-2B |
| `vanessa.bernal@bicol-u.edu.ph` | Vanessa Domingo Bernal | 2025-DENT-0028 | 2 | B | ORAL-2B |
| `zachary.david@bicol-u.edu.ph` | Zachary Domingo David | 2025-DENT-0029 | 2 | B | ORAL-2B |
| `joanna.enriquez@bicol-u.edu.ph` | Joanna Samonte Enriquez | 2025-DENT-0030 | 2 | B | ORAL-2B |
| `patrick.macaraeg@bicol-u.edu.ph` | Patrick Alcantara Macaraeg | 2023-DENT-0026 | 4 | B | CLINIC-4B |
| `trisha.llanes@bicol-u.edu.ph` | Trisha Robles Llanes | 2026-DENT-0002 | 1 | A | DENT-1A |
| `francis.escobar@bicol-u.edu.ph` | Francis Yap Escobar | 2026-DENT-0003 | 1 | A | DENT-1A |
| `aaron.ortega@bicol-u.edu.ph` | Aaron Quiambao Ortega | 2026-DENT-0004 | 1 | A | DENT-1A |
| `kristel.magbanua@bicol-u.edu.ph` | Kristel David Magbanua | 2026-DENT-0005 | 1 | A | DENT-1A |
| `christian.agustin@bicol-u.edu.ph` | Christian San Jose Agustin | 2026-DENT-0006 | 1 | A | DENT-1A |
| `markanthony.esteban@bicol-u.edu.ph` | Mark Anthony Calleja Esteban | 2026-DENT-0008 | 1 | A | DENT-1A |
| `charmaine.domingo@bicol-u.edu.ph` | Charmaine Agustin Domingo | 2026-DENT-0009 | 1 | A | DENT-1A |
| `carlo.balagtas@bicol-u.edu.ph` | Carlo Guevarra Balagtas | 2026-DENT-0010 | 1 | A | DENT-1A |
| `elaine.tuazon@bicol-u.edu.ph` | Elaine Vergara Tuazon | 2026-DENT-0011 | 1 | A | DENT-1A |
| `gwyneth.delosreyes@bicol-u.edu.ph` | Gwyneth Barrameda Delos Reyes | 2026-DENT-0012 | 1 | A | DENT-1A |
| `paolo.alcantara@bicol-u.edu.ph` | Paolo Manansala Alcantara | 2026-DENT-0013 | 1 | A | DENT-1A |
| `joanna.espiritu@bicol-u.edu.ph` | Joanna Zamora Espiritu | 2026-DENT-0014 | 1 | A | DENT-1A |
| `patrick.serrano@bicol-u.edu.ph` | Patrick Castillo Serrano | 2026-DENT-0015 | 1 | A | DENT-1A |
| `lorraine.miranda@bicol-u.edu.ph` | Lorraine Morales Miranda | 2026-DENT-0016 | 1 | B | DENT-1B |
| `kimberly.umali@bicol-u.edu.ph` | Kimberly Francisco Umali | 2026-DENT-0017 | 1 | B | DENT-1B |
| `angelo.llanes@bicol-u.edu.ph` | Angelo Quizon Llanes | 2026-DENT-0018 | 1 | B | DENT-1B |
| `stephanie.quiambao@bicol-u.edu.ph` | Stephanie Olivares Quiambao | 2026-DENT-0019 | 1 | B | DENT-1B |
| `anthony.zamora@bicol-u.edu.ph` | Anthony Sarmiento Zamora | 2026-DENT-0021 | 1 | B | DENT-1B |
| `samuel.barrameda@bicol-u.edu.ph` | Samuel Espiritu Barrameda | 2026-DENT-0022 | 1 | B | DENT-1B |
| `frances.feliciano@bicol-u.edu.ph` | Frances Ignacio Feliciano | 2026-DENT-0023 | 1 | B | DENT-1B |
| `markanthony.rosales@bicol-u.edu.ph` | Mark Anthony Fernandez Rosales | 2026-DENT-0024 | 1 | B | DENT-1B |

## Students without an account (for invitation testing)

These current first-year students have no login yet. Faculty can send them an invitation from Classes & Rosters; the invitation e-mail arrives in Mailpit.

| Institutional e-mail | Name | Student no. | Section |
|---|---|---|---|
| `lara.serrano@bicol-u.edu.ph` | Lara Guevarra Serrano | 2026-DENT-0025 | DENT-1B |
| `denise.calleja@bicol-u.edu.ph` | Denise Domingo Calleja | 2026-DENT-0026 | DENT-1B |
| `earl.santiago@bicol-u.edu.ph` | Earl Abad Santiago | 2026-DENT-0027 | DENT-1B |
| `carmina.fernandez@bicol-u.edu.ph` | Carmina De Leon Fernandez | 2026-DENT-0028 | DENT-1B |
| `nicole.cabrera@bicol-u.edu.ph` | Nicole Jimenez Cabrera | 2026-DENT-0029 | DENT-1B |
| `carl.ortega@bicol-u.edu.ph` | Carl Fajardo Ortega | 2026-DENT-0030 | DENT-1B |

## What the data contains

- 8 courses, 28 class sections (8 in 2026-2027, 20 in 2024-2025 and 2025-2026).
- 120 students in four cohorts (admitted 2023–2026), two blocks of 15 per cohort.
- 420 enrollments, 168 assessments, 2040 scores, 418 attendance sessions, 6270 attendance records.
- Past enrollments have final grades computed like the server: Quiz, Laboratory, the period exam and Attendance weighted by the course ratios, attendance split at the term midpoint, and a 40 / 60 Midterm / Final ratio. Run `backend/bin/bootstrap-grade-weights.php` (or `start-dev.ps1`) after seeding to create the matching grade weights.
- 25 past enrollments are flagged for remedial, with 32 recorded remedial attempts (passed, failed, and upcoming) and 3 cost recovery results (2 passed, 1 failed); other double failures still require cost recovery.
- Current-year enrollments have quiz and laboratory scores only, so their grades show *Pending evaluation*.
- Current-term check-ins are stored as biometric attendance history, but **no face (biometric) profiles are seeded**: every student or secretary must complete Face Registration before a new biometric check-in. Notifications and audit events are not seeded.

Regenerate this file and the seed together; do not edit them by hand.
