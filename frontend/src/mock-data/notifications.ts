// src/mock-data/notifications.ts

import { NotificationInfo } from "../types/dashboard";

export const notificationsData: NotificationInfo[] = [
  {
    id: "notif-001",
    type: "grade",
    title: "Grades Published",
    message: "Your grades for Math 101 have been published.",
    createdAt: new Date().toISOString(),
    read: false,
  },
  {
    id: "notif-002",
    type: "attendance",
    title: "Attendance Updated",
    message: "Attendance for Section A has been updated.",
    createdAt: new Date().toISOString(),
    read: false,
  },
  {
    id: "notif-003",
    type: "assessment",
    title: "Assessment Created",
    message: "A new quiz has been assigned to your class.",
    createdAt: new Date().toISOString(),
    read: false,
  },
];
