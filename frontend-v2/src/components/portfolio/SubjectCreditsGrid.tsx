/**
 * SubjectCreditsGrid - donut-chart grid of progress toward each school subject's
 * credit (XP / required XP). Extracted from the student Profile screen so the
 * parent's read-only kid profile renders subject credits identically.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { UIText, Card } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export interface SubjectXPRow {
  school_subject: string;
  xp_amount: number;
  pending_xp?: number;
}

const SUBJECT_XP_PER_CREDIT = 2000;
const SUBJECT_CREDIT_REQUIREMENTS: Record<string, { displayName: string; credits: number }> = {
  language_arts: { displayName: 'Language Arts', credits: 4 },
  math: { displayName: 'Mathematics', credits: 3 },
  science: { displayName: 'Science', credits: 3 },
  social_studies: { displayName: 'Social Studies', credits: 4 },
  financial_literacy: { displayName: 'Financial Literacy', credits: 0.5 },
  health: { displayName: 'Health', credits: 0.5 },
  pe: { displayName: 'Physical Education', credits: 2 },
  fine_arts: { displayName: 'Fine Arts', credits: 1.5 },
  cte: { displayName: 'Career & Tech', credits: 1 },
  digital_literacy: { displayName: 'Digital Literacy', credits: 0.5 },
  electives: { displayName: 'Electives', credits: 4 },
};

const DONUT_SIZE = 80;
const DONUT_STROKE = 7;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export function SubjectCreditsGrid({ subjectXP }: { subjectXP: SubjectXPRow[] }) {
  const c = useThemeColors();
  if (!subjectXP || subjectXP.length === 0) return null;

  return (
    <View className="flex-row flex-wrap">
      {subjectXP.map((s: any, idx: number) => {
        const subject = s.school_subject || '';
        const req = SUBJECT_CREDIT_REQUIREMENTS[subject];
        const displayName = req?.displayName || subject.replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase()).replace(/\b(Cte|Pe)\b/g, (m: string) => m.toUpperCase());
        const xpRequired = (req?.credits || 1) * SUBJECT_XP_PER_CREDIT;
        const earned = s.xp_amount || 0;
        const pending = s.pending_xp || 0;
        const earnedPct = Math.min((earned / xpRequired) * 100, 100);
        const pendingPct = Math.min((pending / xpRequired) * 100, 100);
        const totalPct = Math.min(earnedPct + pendingPct, 100);
        const displayPct = Math.round(totalPct);
        const earnedOffset = DONUT_CIRCUMFERENCE - (earnedPct / 100) * DONUT_CIRCUMFERENCE;
        const pendingOffset = DONUT_CIRCUMFERENCE - (totalPct / 100) * DONUT_CIRCUMFERENCE;

        return (
          <View key={subject || `subject-${idx}`} className="w-1/2 md:w-1/3 lg:w-1/4 items-center p-2 mb-2">
            <Card variant="elevated" size="sm" className="w-full items-center py-3 px-2">
              <View style={{ width: DONUT_SIZE, height: DONUT_SIZE }} className="items-center justify-center">
                <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
                  <SvgCircle
                    cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS}
                    stroke={c.border} strokeWidth={DONUT_STROKE} fill="none"
                  />
                  {pending > 0 && (
                    <SvgCircle
                      cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS}
                      stroke="#FCD34D" strokeWidth={DONUT_STROKE} fill="none"
                      strokeDasharray={`${DONUT_CIRCUMFERENCE}`}
                      strokeDashoffset={pendingOffset}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
                    />
                  )}
                  {earned > 0 && (
                    <SvgCircle
                      cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS}
                      stroke="#6D469B" strokeWidth={DONUT_STROKE} fill="none"
                      strokeDasharray={`${DONUT_CIRCUMFERENCE}`}
                      strokeDashoffset={earnedOffset}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
                    />
                  )}
                </Svg>
                <View className="absolute items-center justify-center">
                  <UIText size="lg" className="font-poppins-bold text-typography-700">{displayPct}%</UIText>
                </View>
              </View>
              <UIText size="sm" className="font-poppins-semibold text-center mt-2">{displayName}</UIText>
              <UIText size="xs" className="text-typography-500 text-center">{earned.toLocaleString()} / {xpRequired.toLocaleString()} XP</UIText>
              {pending > 0 && (
                <UIText size="xs" className="text-amber-600 text-center">+{pending.toLocaleString()} pending</UIText>
              )}
            </Card>
          </View>
        );
      })}
    </View>
  );
}
