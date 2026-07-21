// src/services/mock/studentService.ts
import { Student } from "../../types/student";
import { studentsData } from "../../mock-data/students";
import { delay } from "../../utils/delay";
import { successResponse, errorResponse, ApiResponse } from "../../utils/response";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";

export const studentService = {
  async getStudents(): Promise<ApiResponse<Student[]>> {
    return delay(successResponse([...studentsData]), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getStudent(id: string): Promise<ApiResponse<Student>> {
    const student = studentsData.find((s) => s.id === id);
    if (!student) return delay(errorResponse<Student>('Student not found'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
    return delay(successResponse({ ...student }), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async getStudentsByClass(sectionId: string): Promise<ApiResponse<Student[]>> {
    const filtered = studentsData.filter((s) => s.sectionId === sectionId);
    return delay(successResponse(filtered), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async searchStudents(query: string): Promise<ApiResponse<Student[]>> {
    const lower = query.toLowerCase();
    const results = studentsData.filter((s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(lower) ||
      s.studentNumber.includes(lower)
    );
    return delay(successResponse(results), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },

  async filterStudents(filterFn: (s: Student) => boolean): Promise<ApiResponse<Student[]>> {
    const results = studentsData.filter(filterFn);
    return delay(successResponse(results), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
