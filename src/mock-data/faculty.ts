// src/mock-data/faculty.ts
import { Faculty } from "../types/faculty";

export const facultyData: Faculty[] = [
  {
    id: "fac-001",
    firstName: "Ana",
    lastName: "Santos",
    email: "ana.santos@dentisys.edu",
    department: "Dental Surgery",
    role: "faculty",
    assignedSubjects: ["subj-001", "subj-002"],
    assignedClasses: ["sec-001", "sec-002"],
  },
  {
    id: "fac-002",
    firstName: "Juan",
    lastName: "López",
    email: "juan.lopez@dentisys.edu",
    department: "Orthodontics",
    role: "faculty",
    assignedSubjects: ["subj-003"],
    assignedClasses: ["sec-003"],
  },
];
