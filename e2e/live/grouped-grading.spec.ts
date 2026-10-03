import { expect, test, type Locator, type Page } from '@playwright/test';

const facultyEmail = process.env.E2E_GROUPED_FACULTY_EMAIL ?? 'live.grouped.faculty@bicol-u.edu.ph';
const facultyPassword = process.env.E2E_GROUPED_FACULTY_PASSWORD ?? 'Faculty123!';
const studentEmail = 'live.grouped.student@bicol-u.edu.ph';
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? 'Student123!';
const fixtureCourseCode = 'INT-GROUPED';
const fixtureClassName = 'GROUPED-1A';
const fixtureStudentNumber = 'INT-GROUPED-001';
const defaultsFixtureCourseCode = 'INT-SPLIT-DRAFT';
const defaultsFixtureClassName = 'SPLIT-DRAFT-1A';
const defaultsFixtureAssessmentTitle = 'Live ambiguous default Quiz';

type JsonRecord = Record<string, any>;

async function jsonResponse(response: Awaited<ReturnType<Page['request']['get']>>) {
  const body = await response.text();
  expect(response.status(), body).toBeLessThan(500);
  return JSON.parse(body) as JsonRecord;
}

async function login(page: Page, email: string, password: string) {
  const response = await page.request.post('/api/auth/login', { data: { email, password } });
  const payload = await jsonResponse(response);
  expect(response.ok(), JSON.stringify(payload)).toBeTruthy();
  expect(payload.type).toBe('direct_login');
  expect(payload.access_token).toEqual(expect.any(String));
  return payload as { access_token: string };
}

function fixtureConfigGet(page: Page, courseId: string) {
  return page.waitForResponse(response => {
    if (!response.url().includes('/api/faculty/grading-config') || response.request().method() !== 'GET') return false;
    return new URL(response.url()).searchParams.get('courseId') === courseId;
  });
}

async function selectFixtureOffering(page: Page, courseCode: string, classId: string) {
  const selects = page.getByRole('main').locator('select');
  await selects.first().selectOption(courseCode);
  await selects.nth(1).selectOption(classId);
}

async function assignDraftCategoriesToLecture(editor: Locator) {
  const unassigned = editor.getByTestId('unassigned-component-categories');
  while (await unassigned.count()) {
    const componentSelects = unassigned.getByRole('combobox');
    if (!(await componentSelects.count())) break;
    await componentSelects.first().selectOption('Lecture');
  }
}

async function deleteDraftCategory(page: Page, editor: Locator, name: string) {
  const deleteButton = editor.getByRole('button', { name: `Delete category ${name}`, exact: true });
  await deleteButton.click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(deleteButton).toHaveCount(0);
}

async function keepOnlyQuizForLecture(
  page: Page,
  editor: Locator,
  extraLectureCategories: string[],
  extraLaboratoryCategories: string[],
) {
  await editor.getByRole('tab', { name: 'Lecture Categories', exact: true }).click();
  await assignDraftCategoriesToLecture(editor);
  for (const category of extraLectureCategories) await deleteDraftCategory(page, editor, category);

  const names = editor.locator('input[placeholder*="Category name"]');
  await expect(names).toHaveCount(1);
  await expect(names.first()).toHaveValue('Quiz');
  const weights = editor.locator('input[placeholder="0"]');
  await expect(weights).toHaveCount(1);
  await weights.first().fill('100');

  await editor.getByRole('tab', { name: 'Laboratory Categories', exact: true }).click();
  for (const category of extraLaboratoryCategories) await deleteDraftCategory(page, editor, category);
  await expect(editor.locator('input[placeholder*="Category name"]')).toHaveCount(1);
  await editor.locator('input[placeholder*="Category name"]').first().fill('Quiz');
  const laboratoryWeight = editor.locator('input[placeholder="0"]');
  await expect(laboratoryWeight).toHaveCount(1);
  await laboratoryWeight.first().fill('100');
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('response', response => {
    if (response.status() >= 500) errors.push(`http ${response.status()}: ${response.url()}`);
  });
  (page as Page & { __groupedLiveErrors?: string[] }).__groupedLiveErrors = errors;
});

test.afterEach(async ({ page }) => {
  const errors = (page as Page & { __groupedLiveErrors?: string[] }).__groupedLiveErrors ?? [];
  expect(errors, errors.join('\n')).toEqual([]);
});

test('new offering defaults to split grading and requires an explicit mapping for its ambiguous Quiz', async ({ page }) => {
  test.setTimeout(60_000);
  const faculty = await login(page, facultyEmail, facultyPassword);
  const facultyHeaders = { Authorization: `Bearer ${faculty.access_token}` };
  const classesResponse = await page.request.get('/api/faculty/classes', { headers: facultyHeaders });
  const classesPayload = await jsonResponse(classesResponse);
  const currentSchoolYear = String(classesPayload.currentSchoolYear ?? '').trim();
  const fixtureClasses = (classesPayload.classes ?? []).filter((candidate: JsonRecord) =>
    candidate.courseCode === defaultsFixtureCourseCode
    && candidate.csName === defaultsFixtureClassName
    && String(candidate.status ?? '').toLowerCase() === 'active'
    && String(candidate.schoolYear ?? '').toLowerCase() === currentSchoolYear.toLowerCase()
  );
  expect(currentSchoolYear).not.toBe('');
  expect(fixtureClasses, 'The split-default fixture must be active in the current school year.').toHaveLength(1);
  const targetClass = fixtureClasses[0] as JsonRecord;
  const classId = String(targetClass.id ?? targetClass.csId);
  const courseId = String(targetClass.courseId);

  const initialConfigResponse = await page.request.get(
    `/api/faculty/grading-config?courseId=${courseId}&semester=${encodeURIComponent(String(targetClass.semester))}&schoolYear=${encodeURIComponent(String(targetClass.schoolYear))}`,
    { headers: facultyHeaders },
  );
  const initialConfigPayload = await jsonResponse(initialConfigResponse);
  expect(initialConfigPayload.configuration).toBeNull();
  const defaults = initialConfigPayload.defaults as JsonRecord;
  expect(defaults).toEqual(expect.objectContaining({
    schemaMode: 'periods',
    componentMode: 'lecture_laboratory',
    componentWeights: { lecture: 60, laboratory: 40 },
    termRatio: { midterm: 30, final: 70 },
  }));
  const expectedCategories = [
    { component: 'Lecture', name: 'Term Exam', weight: 50 },
    { component: 'Lecture', name: 'Quiz', weight: 20 },
    { component: 'Lecture', name: 'Outputs', weight: 20 },
    { component: 'Lecture', name: 'Participation', weight: 10 },
    { component: 'Laboratory', name: 'Practical Exam', weight: 50 },
    { component: 'Laboratory', name: 'Laboratory Exercises', weight: 30 },
    { component: 'Laboratory', name: 'Quiz', weight: 10 },
    { component: 'Laboratory', name: 'Recitation', weight: 10 },
  ];
  const categoryProjection = (categories: JsonRecord[]) => categories.map(category => ({
    component: category.component,
    name: category.name,
    weight: Number(category.weight),
  }));
  const inDefaultOrder = (categories: JsonRecord[]) => {
    const order = new Map(expectedCategories.map((category, index) => [`${category.component}:${category.name}`, index] as const));
    return [...categories].sort((left, right) =>
      (order.get(`${left.component}:${left.name}`) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(`${right.component}:${right.name}`) ?? Number.MAX_SAFE_INTEGER)
    );
  };
  expect(categoryProjection(defaults.midtermCategories)).toEqual(expectedCategories);
  expect(categoryProjection(defaults.finalCategories)).toEqual(expectedCategories);
  expect(defaults.midtermCategories.every((category: JsonRecord) => category.sourceKind === 'assessment')).toBeTruthy();
  expect(defaults.finalCategories.every((category: JsonRecord) => category.sourceKind === 'assessment')).toBeTruthy();

  const configGetPromise = fixtureConfigGet(page, courseId);
  await page.goto('/grades?tab=components');
  await expect(page.getByRole('main').locator('select').first()).toBeVisible({ timeout: 15000 });
  await selectFixtureOffering(page, String(targetClass.courseCode), classId);
  const configGetResponse = await configGetPromise;
  expect((await jsonResponse(configGetResponse)).configuration).toBeNull();

  const editor = page.locator('form').filter({ has: page.locator('#lecture-component-weight') });
  await expect(editor.locator('#period-component-mode')).toHaveCount(0);
  await expect(editor.getByRole('button', { name: /Apply syllabus example/i })).toHaveCount(0);
  await expect(editor.locator('#lecture-component-weight')).toHaveValue('60');
  await expect(editor.locator('#laboratory-component-weight')).toHaveValue('40');
  await expect(editor.locator('#midterm-ratio-input')).toHaveValue('30');
  await expect(editor.locator('#final-ratio-input')).toHaveValue('70');

  const assertDefaultComponentCategories = async (component: 'Lecture' | 'Laboratory', expected: Array<{ name: string; weight: string }>) => {
    await editor.getByRole('tab', { name: `${component} Categories`, exact: true }).click();
    const names = editor.locator('input[placeholder*="Category name"]');
    const weights = editor.locator('input[placeholder="0"]');
    await expect(names).toHaveCount(4);
    for (let index = 0; index < expected.length; index += 1) {
      await expect(names.nth(index)).toHaveValue(expected[index].name);
      await expect(weights.nth(index)).toHaveValue(expected[index].weight);
    }
  };
  await assertDefaultComponentCategories('Lecture', [
    { name: 'Term Exam', weight: '50' }, { name: 'Quiz', weight: '20' },
    { name: 'Outputs', weight: '20' }, { name: 'Participation', weight: '10' },
  ]);
  await assertDefaultComponentCategories('Laboratory', [
    { name: 'Practical Exam', weight: '50' }, { name: 'Laboratory Exercises', weight: '30' },
    { name: 'Quiz', weight: '10' }, { name: 'Recitation', weight: '10' },
  ]);

  const failedSavePromise = page.waitForResponse(response =>
    response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT'
  );
  const recordedErrors = (page as Page & { __groupedLiveErrors?: string[] }).__groupedLiveErrors ?? [];
  const errorCountBeforeExpected422 = recordedErrors.length;
  await editor.getByRole('button', { name: 'Save Initial Schema', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const failedSaveResponse = await failedSavePromise;
  expect(failedSaveResponse.status()).toBe(422);
  const failedSavePayload = await jsonResponse(failedSaveResponse);
  expect(failedSavePayload.code).toBe('GRADING_COMPONENT_MAPPING_REQUIRED');
  const unmappedAssessments = failedSavePayload.assessments ?? failedSavePayload.details?.assessments;
  expect(unmappedAssessments).toEqual([
    expect.objectContaining({ title: defaultsFixtureAssessmentTitle, gradingPeriod: 'Midterm' }),
  ]);
  await expect(page.getByText('Existing Assessments Require Category Mappings', { exact: true })).toBeVisible();
  const expected422ConsoleErrors = recordedErrors
    .map((error, index) => ({ error, index }))
    .filter(({ error, index }) => index >= errorCountBeforeExpected422
      && error.startsWith('console:')
      && error.includes('status of 422'));
  expect(expected422ConsoleErrors.length).toBeLessThanOrEqual(1);
  if (expected422ConsoleErrors.length === 1) recordedErrors.splice(expected422ConsoleErrors[0].index, 1);

  const assignment = page.getByLabel(`Category for ${defaultsFixtureAssessmentTitle}`);
  const categoryOptions = await assignment.locator('option').allTextContents();
  expect(categoryOptions).toContain('Lecture · Quiz');
  expect(categoryOptions).toContain('Laboratory · Quiz');
  await assignment.selectOption({ label: 'Lecture · Quiz' });

  let successfulSavePayload: JsonRecord | null = null;
  const successfulSavePromise = page.waitForResponse(async response => {
    if (!response.url().includes('/api/faculty/grading-config') || response.request().method() !== 'PUT') return false;
    successfulSavePayload = response.request().postDataJSON() as JsonRecord;
    return true;
  });
  await editor.getByRole('button', { name: 'Save Initial Schema', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const successfulSaveResponse = await successfulSavePromise;
  expect(successfulSaveResponse.status()).toBe(201);
  const successfulSaveResult = await jsonResponse(successfulSaveResponse);
  expect(successfulSaveResult.status).toBe('ok');
  expect(successfulSavePayload).toEqual(expect.objectContaining({
    schemaMode: 'periods',
    componentMode: 'lecture_laboratory',
    componentWeights: { lecture: 60, laboratory: 40 },
    termRatio: { midterm: 30, final: 70 },
    assessmentAssignments: [expect.objectContaining({
      assessmentId: Number(unmappedAssessments[0].assessmentId),
      categoryName: 'Quiz',
      gradingPeriod: 'Midterm',
      component: 'Lecture',
    })],
  }));

  const persistedConfigPromise = fixtureConfigGet(page, courseId);
  await page.reload();
  await expect(page.getByRole('main').locator('select').first()).toBeVisible();
  await selectFixtureOffering(page, String(targetClass.courseCode), classId);
  const persistedConfigResponse = await persistedConfigPromise;
  const persistedConfig = (await jsonResponse(persistedConfigResponse)).configuration as JsonRecord;
  expect(persistedConfig).toEqual(expect.objectContaining({
    schemaMode: 'periods',
    componentMode: 'lecture_laboratory',
    componentWeights: { lecture: 60, laboratory: 40 },
    termRatio: { midterm: 30, final: 70 },
  }));
  expect(persistedConfig.categories).toHaveLength(16);
  for (const gradingPeriod of ['Midterm', 'Final']) {
    expect(categoryProjection(inDefaultOrder(
      persistedConfig.categories.filter((category: JsonRecord) => category.gradingPeriod === gradingPeriod),
    ))).toEqual(expectedCategories);
  }
  const persistedQuiz = (persistedConfig.categories as JsonRecord[]).find(category =>
    category.gradingPeriod === 'Midterm' && category.component === 'Lecture' && category.name === 'Quiz'
  );
  expect(persistedQuiz).toEqual(expect.objectContaining({ weight: 20 }));

  const assessmentReadResponse = await page.request.get('/api/faculty/assessments', { headers: facultyHeaders });
  const assessmentReadPayload = await jsonResponse(assessmentReadResponse);
  const persistedAssessment = (assessmentReadPayload as JsonRecord[]).find(assessment =>
    assessment.title === defaultsFixtureAssessmentTitle
  );
  expect(persistedAssessment?.gradingPeriod).toBe('Midterm');
  expect(String(persistedAssessment?.gradingCategoryId)).toBe(String(persistedQuiz?.id));
  expect(persistedQuiz).toEqual(expect.objectContaining({
    name: 'Quiz', gradingPeriod: 'Midterm', component: 'Lecture',
  }));
});

test('fresh grouped offering saves in the editor, recomputes from live scores, and reads in Faculty and Student views', async ({ page }) => {
  test.setTimeout(120_000);
  const faculty = await login(page, facultyEmail, facultyPassword);
  const facultyHeaders = { Authorization: `Bearer ${faculty.access_token}` };

  const classesResponse = await page.request.get('/api/faculty/classes', { headers: facultyHeaders });
  const classesPayload = await jsonResponse(classesResponse);
  const currentSchoolYear = String(classesPayload.currentSchoolYear ?? '').trim();
  const fixtureClasses = (classesPayload.classes ?? []).filter((candidate: JsonRecord) =>
    candidate.courseCode === fixtureCourseCode
    && candidate.csName === fixtureClassName
    && String(candidate.status ?? '').toLowerCase() === 'active'
    && String(candidate.schoolYear ?? '').toLowerCase() === currentSchoolYear.toLowerCase()
  );
  expect(currentSchoolYear).not.toBe('');
  expect(fixtureClasses, 'The isolated current-year fixture class must be the selected target.').toHaveLength(1);
  const targetClass = fixtureClasses[0] as JsonRecord;
  const classId = String(targetClass.id ?? targetClass.csId);
  const courseId = String(targetClass.courseId);
  expect(classId).not.toBe('undefined');
  expect(courseId).not.toBe('undefined');

  const studentsResponse = await page.request.get('/api/faculty/students', { headers: facultyHeaders });
  const facultyStudents = await jsonResponse(studentsResponse);
  const fixtureStudents = facultyStudents.filter((student: JsonRecord) =>
    student.studentId === fixtureStudentNumber
    && (student.classSections ?? []).some((section: JsonRecord) => String(section.classId) === classId)
  );
  expect(fixtureStudents, 'The grouped fixture must contain its dedicated Student enrollment.').toHaveLength(1);
  const fixtureStudent = fixtureStudents[0] as JsonRecord;
  const fixtureEnrollment = fixtureStudent.classSections.find((section: JsonRecord) => String(section.classId) === classId) as JsonRecord | undefined;
  if (!fixtureEnrollment) throw new Error('The grouped fixture Student has no enrollment in the isolated class.');
  const enrollmentId = String(fixtureEnrollment.enrollmentId);

  const initialConfigPromise = fixtureConfigGet(page, courseId);
  await page.goto('/grades?tab=components');
  await expect(page.getByRole('main').locator('select').first()).toBeVisible({ timeout: 15000 });
  await selectFixtureOffering(page, String(targetClass.courseCode), classId);
  const initialConfigResponse = await initialConfigPromise;
  const initialConfigPayload = await jsonResponse(initialConfigResponse);
  expect(initialConfigPayload.configuration).toBeNull();

  const editor = page.locator('form').filter({ has: page.locator('#lecture-component-weight') });
  await expect(editor.getByRole('tab', { name: 'Lecture Categories', exact: true })).toBeVisible();
  await expect(editor.locator('#lecture-component-weight')).toHaveValue('60');
  await expect(editor.locator('#laboratory-component-weight')).toHaveValue('40');

  await keepOnlyQuizForLecture(page, editor, ['Term Exam', 'Outputs', 'Participation'], ['Practical Exam', 'Laboratory Exercises', 'Recitation']);
  await editor.getByRole('button', { name: /Finals Categories/ }).click();
  await keepOnlyQuizForLecture(page, editor, ['Term Exam', 'Outputs', 'Participation'], ['Practical Exam', 'Laboratory Exercises', 'Recitation']);
  await editor.locator('#midterm-ratio-input').fill('30');
  await expect(editor.locator('#final-ratio-input')).toHaveValue('70');

  const savePromise = page.waitForResponse(response =>
    response.url().includes('/api/faculty/grading-config') && response.request().method() === 'PUT'
  );
  await editor.getByRole('button', { name: 'Save Initial Schema', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const saveResponse = await savePromise;
  const savePayload = await jsonResponse(saveResponse);
  expect(saveResponse.ok(), JSON.stringify(savePayload)).toBeTruthy();
  expect(savePayload.status).toBe('ok');
  expect(savePayload.configuration).toEqual(expect.objectContaining({
    schemaMode: 'periods',
    componentMode: 'lecture_laboratory',
    componentWeights: { lecture: 60, laboratory: 40 },
    termRatio: { midterm: 30, final: 70 },
  }));

  await page.evaluate(() => localStorage.clear());
  const reloadConfigPromise = fixtureConfigGet(page, courseId);
  await page.reload();
  await expect(page.getByRole('main').locator('select').first()).toBeVisible();
  await selectFixtureOffering(page, String(targetClass.courseCode), classId);
  const reloadConfigResponse = await reloadConfigPromise;
  const reloadConfigPayload = await jsonResponse(reloadConfigResponse);
  const configuration = reloadConfigPayload.configuration as JsonRecord;
  expect(configuration).toEqual(expect.objectContaining({
    schemaMode: 'periods',
    componentMode: 'lecture_laboratory',
    componentWeights: { lecture: 60, laboratory: 40 },
    termRatio: { midterm: 30, final: 70 },
  }));
  const categories = configuration.categories as JsonRecord[];
  expect(categories).toHaveLength(4);
  for (const gradingPeriod of ['Midterm', 'Final']) {
    for (const component of ['Lecture', 'Laboratory']) {
      const matching = categories.filter(category =>
        category.gradingPeriod === gradingPeriod && category.component === component && category.name === 'Quiz'
      );
      expect(matching, `${gradingPeriod} ${component} should persist its Quiz category.`).toHaveLength(1);
      expect(Number(matching[0].weight)).toBe(100);
    }
  }

  const assessmentCases = [
    { key: 'midterm-lecture', gradingPeriod: 'Midterm', component: 'Lecture', score: 80 },
    { key: 'midterm-laboratory', gradingPeriod: 'Midterm', component: 'Laboratory', score: 90 },
    { key: 'final-lecture', gradingPeriod: 'Final', component: 'Lecture', score: 90 },
    { key: 'final-laboratory', gradingPeriod: 'Final', component: 'Laboratory', score: 80 },
  ];
  const titlePrefix = `Live Grouped ${Date.now()}`;
  const assessmentPayload = assessmentCases.map(item => {
    const category = categories.find(candidate =>
      candidate.gradingPeriod === item.gradingPeriod && candidate.component === item.component && candidate.name === 'Quiz'
    );
    if (!category) throw new Error(`${item.gradingPeriod} ${item.component} Quiz category is missing after reload.`);
    return {
      title: `${titlePrefix} ${item.key}`,
      type: 'Quiz',
      subjectCode: fixtureCourseCode,
      classId,
      gradingPeriod: item.gradingPeriod,
      maxScore: 100,
      dueDate: null,
      instructions: '',
      remarks: '',
      status: 'Active',
      transmutationEnabled: false,
      transmutationMinimumPercentage: 0,
      transmutationMaximumPercentage: 0,
      attendanceSessionDate: null,
      attendanceSessionCode: null,
      gradingCategoryId: category.id,
    };
  });
  const createAssessmentsResponse = await page.request.post('/api/faculty/assessments', {
    headers: { ...facultyHeaders, 'Content-Type': 'application/json' },
    data: assessmentPayload,
  });
  const createAssessmentsPayload = await jsonResponse(createAssessmentsResponse);
  expect(createAssessmentsResponse.ok(), JSON.stringify(createAssessmentsPayload)).toBeTruthy();

  const assessmentReadResponse = await page.request.get('/api/faculty/assessments', { headers: facultyHeaders });
  const assessmentReadPayload = await jsonResponse(assessmentReadResponse);
  expect(Array.isArray(assessmentReadPayload)).toBeTruthy();
  const liveAssessments = (assessmentReadPayload as JsonRecord[]).filter(assessment =>
    String(assessment.title ?? '').startsWith(titlePrefix)
  );
  expect(liveAssessments).toHaveLength(4);
  const scoreBatches = assessmentCases.map(item => {
    const assessment = liveAssessments.find(candidate => candidate.title === `${titlePrefix} ${item.key}`);
    if (!assessment) throw new Error(`The ${item.key} assessment was not created through the live API.`);
    return {
      assessmentId: String(assessment.id),
      scores: [{ studentId: String(fixtureStudent.id), score: item.score }],
    };
  });
  const scoresResponse = await page.request.post('/api/faculty/scores', {
    headers: { ...facultyHeaders, 'Content-Type': 'application/json' },
    data: { batches: scoreBatches },
  });
  const scoresPayload = await jsonResponse(scoresResponse);
  expect(scoresResponse.ok(), JSON.stringify(scoresPayload)).toBeTruthy();
  expect(Number(scoresPayload.savedCount)).toBe(4);

  await page.goto('/grades?tab=summaries');
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: 'Recompute Grades', exact: true })).toBeVisible({ timeout: 15000 });
  await selectFixtureOffering(page, String(targetClass.courseCode), classId);
  const recomputeResponsePromise = page.waitForResponse(response =>
    response.url().includes('/api/faculty/grades/compute') && response.request().method() === 'POST'
  );
  await main.getByRole('button', { name: 'Recompute Grades', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Recomputation', exact: true }).click();
  const recomputeResponse = await recomputeResponsePromise;
  const recomputePayload = await jsonResponse(recomputeResponse);
  expect(recomputeResponse.ok(), JSON.stringify(recomputePayload)).toBeTruthy();
  const computedResult = (recomputePayload.results as JsonRecord[]).find(result => String(result.enrollmentId) === enrollmentId);
  expect(computedResult?.status).toBe('computed');
  expect(computedResult?.periods?.midterm).toEqual(expect.objectContaining({ status: 'computed', percentage: 84 }));
  expect(computedResult?.periods?.midterm?.components?.lecture?.percentage).toBe(80);
  expect(computedResult?.periods?.midterm?.components?.laboratory?.percentage).toBe(90);
  expect(computedResult?.periods?.final).toEqual(expect.objectContaining({ status: 'computed', percentage: 86 }));
  expect(computedResult?.periods?.final?.components?.lecture?.percentage).toBe(90);
  expect(computedResult?.periods?.final?.components?.laboratory?.percentage).toBe(80);
  expect(Number(computedResult?.percentage)).toBe(85.4);

  const facultyRow = main.locator('.no-print tbody').getByRole('row').filter({ hasText: fixtureStudentNumber });
  await expect(facultyRow).toBeVisible();
  for (const displayedResult of ['80.00%', '90.00%', '84.00%', '86.00%']) {
    await expect(facultyRow).toContainText(displayedResult);
  }
  await expect(facultyRow.getByRole('cell', { name: '2.00', exact: true })).toBeVisible();
  await expect(main.getByText(/All 1 student grade\(s\) recomputed and persisted successfully\./)).toBeVisible();

  await page.goto('about:blank');
  const student = await login(page, studentEmail, studentPassword);
  const studentHeaders = { Authorization: `Bearer ${student.access_token}` };
  const studentClassesResponse = await page.request.get('/api/student/classes', { headers: studentHeaders });
  const studentClassesPayload = await jsonResponse(studentClassesResponse);
  const studentClass = (studentClassesPayload.classes as JsonRecord[]).find(item =>
    item.courseCode === fixtureCourseCode && item.className === fixtureClassName
  );
  if (!studentClass) throw new Error('The Student API does not include the isolated grouped class.');
  expect(studentClass.gradingComponentMode).toBe('lecture_laboratory');
  expect(Number(studentClass.percentage)).toBe(85.4);
  expect(studentClass.gradeComponents.periods.midterm.components.lecture.percentage).toBe(80);
  expect(studentClass.gradeComponents.periods.midterm.components.laboratory.percentage).toBe(90);
  expect(studentClass.gradeComponents.periods.midterm.percentage).toBe(84);
  expect(studentClass.gradeComponents.periods.final.components.lecture.percentage).toBe(90);
  expect(studentClass.gradeComponents.periods.final.components.laboratory.percentage).toBe(80);
  expect(studentClass.gradeComponents.periods.final.percentage).toBe(86);

  await page.goto('/student/classes');
  const studentMain = page.getByRole('main');
  await expect(studentMain.getByRole('heading', { name: 'My Enrolled Classes & Schedule' })).toBeVisible();
  for (const breakdown of [
    'Midterm Lecture: 80.00%',
    'Midterm Laboratory: 90.00%',
    'Finals Lecture: 90.00%',
    'Finals Laboratory: 80.00%',
    'Score %: 85.40%',
  ]) {
    await expect(studentMain).toContainText(breakdown);
  }
});
