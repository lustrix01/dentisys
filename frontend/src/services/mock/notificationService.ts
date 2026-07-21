// src/services/mock/notificationService.ts

import { ApiResponse, successResponse, errorResponse } from "../../utils/response";
import { delay } from "../../utils/delay";
import { MOCK_LATENCY_MIN, MOCK_LATENCY_MAX } from "../../config/mockConfig";
import { NotificationInfo } from "../../types/dashboard";
import { notificationsData } from "../../mock-data/notifications";

/** Mock Notification Service */
export const notificationService = {
  async getLatest(limit: number = 5): Promise<ApiResponse<NotificationInfo[]>> {
    const latest = notificationsData
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
    return delay(successResponse(latest), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
  async markAsRead(id: string): Promise<ApiResponse<null>> {
    const notif = notificationsData.find((n) => n.id === id);
    if (notif) notif.read = true;
    return delay(successResponse(null, 'Marked as read'), MOCK_LATENCY_MIN, MOCK_LATENCY_MAX);
  },
};
