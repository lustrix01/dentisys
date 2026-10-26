import type { Page } from '@playwright/test';

export interface ClassListStudent { id: string; name: string; email: string }
export interface ClassListOptions {
  ay: string; semester: string; code: string; section: string; title: string; year: string;
  lectureUnits: string; labUnits: string; schedules: string[]; students: ClassListStudent[];
}

/** A made-up class list in the Dean's layout, rendered by Chromium. Never a real class list. */
export async function makeClassListPdf(page: Page, o: ClassListOptions): Promise<Buffer> {
  const sheet = await page.context().newPage();
  const rows = o.students.map((s, i) => `<tr><td>${i + 1}</td><td>${s.id}</td><td>DMD</td><td>${s.name}<br>${s.email}</td><td>Male</td><td>${o.year}</td><td>09170000000</td></tr>`).join('');
  await sheet.setContent(`<!doctype html><html><head><style>
    body{font:12px Arial;margin:30px} .h div{margin:3px 0} table{border-collapse:collapse;width:100%;margin-top:14px}
    th,td{border:1px solid #888;padding:6px 8px;text-align:left;vertical-align:middle} td{height:34px}
  </style></head><body>
    <div class="h">
      <div>AY ${o.ay} ${o.semester}</div>
      <div><span>Course Code: ${o.code}</span> &nbsp;&nbsp;&nbsp; <span>Class Section: ${o.section}</span></div>
      <div><span>Course Title:${o.title}</span> &nbsp;&nbsp;&nbsp; <span>Year Level: ${o.year}</span></div>
      <div><span>Academic Units: ${o.lectureUnits}</span> &nbsp;&nbsp;&nbsp; <span>Lab Units: ${o.labUnits}</span></div>
      <div><span>Credit Units: ${o.lectureUnits}</span> &nbsp;&nbsp;&nbsp; <span>Lab Hours: 0.0</span></div>
      <div>Faculty: Made Up Faculty</div>
      <div>Schedules:</div>
      ${o.schedules.map(line => `<div>${line}</div>`).join('')}
      <div>TO FACULTY-IN-CHARGE DO NOT ACCEPT STUDENTS NOT INCLUDED IN THE OFFICIAL LIST</div>
    </div>
    <table><thead><tr><th>#</th><th>Student No.</th><th>Program</th><th>Name</th><th>Gender</th><th>Year Level</th><th>Contact #</th></tr></thead><tbody>${rows}</tbody></table>
    <p>Total Number of Students: ${o.students.length}</p>
  </body></html>`);
  const pdf = await sheet.pdf({ format: 'A4' });
  await sheet.close();
  return pdf;
}
