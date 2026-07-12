// src/utils/__tests__/calculateCategoryAverages.test.ts

import { calculateCategoryAverages } from '../../utils/calculateCategoryAverages';
import { Assessment, StudentScore } from '../../types/gradeManagement';

describe('calculateCategoryAverages', () => {
  const assessments: Assessment[] = [
    { id: 'a1', name: 'Quiz 1', category: 'Quiz', maxScore: 10, dueDate: '2024-01-01', status: 'active', displayOrder: 1 },
    { id: 'a2', name: 'Quiz 2', category: 'Quiz', maxScore: 10, dueDate: '2024-01-15', status: 'active', displayOrder: 2 },
    { id: 'a3', name: 'Midterm', category: 'Midterm', maxScore: 50, dueDate: '2024-02-01', status: 'active', displayOrder: 3 },
  ];

  const studentScores: StudentScore[] = [
    { studentId: 's1', assessmentId: 'a1', score: 8 },
    { studentId: 's1', assessmentId: 'a2', score: 9 },
    { studentId: 's1', assessmentId: 'a3', score: 40 },
  ];

  it('calculates average per category correctly', () => {
    const result = calculateCategoryAverages('s1', assessments, studentScores);
    // Quiz: (8+9)/(10+10) = 0.85 => 85.00
    expect(result['Quiz']).toBeCloseTo(85, 2);
    // Midterm: 40/50 = 0.8 => 80.00
    expect(result['Midterm']).toBeCloseTo(80, 2);
  });

  it('returns null for missing scores', () => {
    const incompleteScores: StudentScore[] = [
      { studentId: 's2', assessmentId: 'a1', score: 7 },
      // a2 missing
      { studentId: 's2', assessmentId: 'a3', score: 35 },
    ];
    const result = calculateCategoryAverages('s2', assessments, incompleteScores);
    expect(result['Quiz']).toBeNull();
    expect(result['Midterm']).toBeCloseTo(70, 2);
  });
});
