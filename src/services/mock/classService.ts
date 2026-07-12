// src/services/mock/classService.ts

import { ApiResponse, successResponse, errorResponse } from "../../utils/response";
import { delay } from "../../utils/delay";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";
import { ClassInfo } from "../../types/dashboard";
import { sectionsData } from "../../mock-data/sections";
import { facultyService } from "./facultyService";
import { coursesData } from "../../mock-data/courses";
import { attendanceData } from "../../mock-data/attendance";

/** Mock Class Service – provides classes assigned to the current faculty */
export const classService = {
  async getClassesByFaculty(): Promise<ApiResponse<ClassInfo[]>> {
    // Get current faculty to know assigned class IDs
    const facRes = await facultyService.getCurrentFaculty();
    if (!facRes.success) return errorResponse<ClassInfo[]>('Failed to load faculty');
    const faculty = facRes.data!;
    const assignedIds = new Set(faculty.assignedClasses);
    // Filter sections (classes) by those IDs
    const classes = sectionsData.filter((sec) => assignedIds.has(sec.id));
    // Map to ClassInfo, enrich with course/subject info and mock attendance
    const classInfo: ClassInfo[] = classes.map((sec) => {
      const course = coursesData.find((c) => c.id === sec.courseId);
      const attendanceRecord = attendanceData.find((a) => a.sectionId === sec.id);
      return {
        id: sec.id,
        subject: course?.name ?? 'Unnamed',
        section: sec.name,
        schedule: sec.schedule,
        studentCount: attendanceRecord?.present ?? 0,
        room: '',
        attendanceRate: attendanceRecord?.attendancePct ?? 0,
        published: true,
      };
    });
    return delay(successResponse(classInfo), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
