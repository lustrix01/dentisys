// src/components/reports/ReportCategoryCards/ReportCategoryCards.tsx
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../../Card";

export type ReportType = "academic" | "attendance" | "assessment" | "retention" | "prediction";

interface Props {
  onSelect: (type: ReportType) => void;
}

const reports: { type: ReportType; title: string; description: string; icon: string }[] = [
  { type: "academic", title: "Academic Report", description: "Grades, GPA, and performance metrics", icon: "📚" },
  { type: "attendance", title: "Attendance Report", description: "Student attendance trends and summaries", icon: "🕒" },
  { type: "assessment", title: "Assessment Report", description: "Assessment scores and analysis", icon: "📝" },
  { type: "retention", title: "Retention Report", description: "Retention and graduation statistics", icon: "🏆" },
  { type: "prediction", title: "Prediction Report", description: "Risk predictions based on interventions", icon: "🔮" },
];

export const ReportCategoryCards: React.FC<Props> = ({ onSelect }) => {
  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {reports.map(r => (
        <Card
          key={r.type}
          hoverEffect
          glow="accent"
          className="cursor-pointer transition-transform hover:-translate-y-1"
          onClick={() => onSelect(r.type)}
        >
          <CardHeader>
            <div className="text-3xl" aria-hidden="true">{r.icon}</div>
          </CardHeader>
          <CardContent>
            <CardTitle>{r.title}</CardTitle>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{r.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
