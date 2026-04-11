import React from 'react';
import { MatchScoreBreakdown } from '../types';

interface Props {
  score: MatchScoreBreakdown;
}

export const MatchScoreDisplay: React.FC<Props> = ({ score }) => {
  return (
    <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
      <h3 className="text-lg font-bold text-slate-900 mb-4">Match Score: {score.total}%</h3>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-sm text-slate-600">Skills (40%)</span>
          <span className="text-sm font-bold">{score.skills.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-slate-600">Experience (20%)</span>
          <span className="text-sm font-bold">{score.experience.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-slate-600">Job Title (15%)</span>
          <span className="text-sm font-bold">{score.jobTitle.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-slate-600">Industry (10%)</span>
          <span className="text-sm font-bold">{score.industry.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-slate-600">Education (5%)</span>
          <span className="text-sm font-bold">{score.education.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-slate-600">Projects (10%)</span>
          <span className="text-sm font-bold">{score.projects.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};
