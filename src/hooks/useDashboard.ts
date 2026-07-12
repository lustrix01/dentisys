// src/hooks/useDashboard.ts

import { useEffect, useState, useMemo } from "react";
import { DashboardSummary, ClassInfo, AssessmentInfo, StudentAttentionInfo, NotificationInfo, DeadlineInfo, DashboardCharts } from "../types/dashboard";
import { dashboardService } from "../services/mock/dashboardService";

interface DashboardState {
  summary?: DashboardSummary;
  classes: ClassInfo[];
  recentAssessments: AssessmentInfo[];
  atRiskStudents: StudentAttentionInfo[];
  notifications: NotificationInfo[];
  deadlines: DeadlineInfo[];
  charts?: DashboardCharts;
  loading: boolean;
  error?: string;
}

/**
 * Hook that loads all dashboard data in parallel and provides loading / error states.
 * Each section can be accessed individually via the returned object.
 */
export const useDashboard = () => {
  const [state, setState] = useState<DashboardState>({
    classes: [],
    recentAssessments: [],
    atRiskStudents: [],
    notifications: [],
    deadlines: [],
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const [summaryRes, classesRes, assessRes, atRiskRes, notifRes, deadRes, chartsRes] =
          await Promise.all([
            dashboardService.getDashboardSummary(),
            dashboardService.getAssignedClasses(),
            dashboardService.getRecentAssessments(),
            dashboardService.getStudentsAtRisk(),
            dashboardService.getNotifications(),
            dashboardService.getUpcomingDeadlines(),
            dashboardService.getDashboardCharts(),
          ]);

        if (cancelled) return;

        if (!summaryRes.success) throw new Error(summaryRes.message);
        if (!classesRes.success) throw new Error(classesRes.message);
        if (!assessRes.success) throw new Error(assessRes.message);
        if (!atRiskRes.success) throw new Error(atRiskRes.message);
        if (!notifRes.success) throw new Error(notifRes.message);
        if (!deadRes.success) throw new Error(deadRes.message);
        if (!chartsRes.success) throw new Error(chartsRes.message);

        setState({
          summary: summaryRes.data!,
          classes: classesRes.data!,
          recentAssessments: assessRes.data!,
          atRiskStudents: atRiskRes.data!,
          notifications: notifRes.data!,
          deadlines: deadRes.data!,
          charts: chartsRes.data!,
          loading: false,
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message ?? 'Failed to load dashboard data',
        }));
      }
    };
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // Memoized stats for quick access
  const stats = useMemo(() => state.summary, [state.summary]);

  return {
    ...state,
    stats,
  };
};
