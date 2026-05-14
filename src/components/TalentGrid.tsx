"use client";

import { useState } from "react";
import type { Assessment, PerformanceCategory } from "@/types/assessment";
import type { ScoringParameters } from "@/types/company";
import { CATEGORY_LABELS } from "@/types/assessment";

interface Props {
  assessments: Assessment[];
  scoringParams: ScoringParameters;
  privacyMode: boolean;
  onClickMember?: (memberId: string) => void;
}

const CATEGORY_FILL: Record<PerformanceCategory, string> = {
  HP: "#22c55e",
  MP: "#eab308",
  LP: "#ef4444",
  LCF: "#ef4444",
};

const ZONE_BG: Record<PerformanceCategory, string> = {
  HP: "#f0fdf4",
  MP: "#fefce8",
  LP: "#fef2f2",
  LCF: "#fee2e2",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Layout matching page 67 of The Strength of Talent:
 *
 * Y-axis: Culture Fit (0 at bottom, 10 at top)
 * X-axis: Productivity (0 at left, 10 at right)
 *
 *  10
 *  ┌────────────┬──────────────────┬──────────┐
 *  │            │                  │          │
 *  │     LP     │       MP         │    HP    │
 *  │            │                  │          │
 *  ├────────────┴──────────────────┴──────────┤
 *  │                                          │
 *  │                 LCF                      │
 *  │                                          │
 *  └──────────────────────────────────────────┘
 *  0                                          10
 *               PRODUCTIVITY →
 *
 * LCF spans full width at the bottom (low culture fit, any productivity).
 * LP is upper-left (OK culture fit but low productivity).
 * HP is upper-right corner (high on both).
 * MP fills the middle.
 */

const TOTAL_W = 600;
const TOTAL_H = 600;
const PAD = { top: 30, right: 20, bottom: 45, left: 55 };
const W = TOTAL_W - PAD.left - PAD.right;
const H = TOTAL_H - PAD.top - PAD.bottom;

export default function TalentGrid({ assessments, scoringParams, privacyMode, onClickMember }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const hpCF = scoringParams.hpCultureFitMin;    // e.g., 9
  const hpP = scoringParams.hpProductivityMin;    // e.g., 9
  const lcfCF = scoringParams.lcfCultureFitMax;   // e.g., 7.5
  const lpP = scoringParams.lpProductivityMax;     // e.g., 6.5

  // Fixed zone proportions matching the book diagram (page 67)
  // These are visual proportions, NOT based on the 0-10 scale
  const LCF_HEIGHT = 0.28;   // LCF bottom band = ~28% of height
  const LP_WIDTH = 0.25;     // LP left column = ~25% of width
  const HP_WIDTH = 0.40;     // HP right column = ~40% of width
  const HP_HEIGHT = 0.45;    // HP top portion = ~45% of the non-LCF area

  const bottom = PAD.top + H;
  const right = PAD.left + W;
  const upperH = H * (1 - LCF_HEIGHT); // height of the upper zone (LP/MP/HP)

  const lcfLineY = PAD.top + upperH;
  const lpLineX = PAD.left + W * LP_WIDTH;
  const hpPLineX = right - W * HP_WIDTH;
  const hpCFLineY = PAD.top + upperH * (1 - HP_HEIGHT);

  /**
   * Position a dot relatively within its zone based on scores.
   * Each zone has its own coordinate space — higher scores push
   * the dot toward the "better" corner of that zone.
   */
  function positionDot(a: Assessment): { cx: number; cy: number } {
    const cat = a.performanceCategory;
    const cf = a.cultureFitScore;
    const prod = a.productivityScore;
    const padding = 16; // keep dots away from edges

    if (cat === "HP") {
      // HP zone: upper-right. Higher scores → upper-right within zone.
      const relProd = hpP > 0 ? Math.min(1, (prod - hpP) / (10 - hpP)) : 0.5;
      const relCF = hpCF > 0 ? Math.min(1, (cf - hpCF) / (10 - hpCF)) : 0.5;
      return {
        cx: hpPLineX + padding + relProd * (right - hpPLineX - padding * 2),
        cy: PAD.top + padding + (1 - relCF) * (hpCFLineY - PAD.top - padding * 2),
      };
    }
    if (cat === "LP") {
      // LP zone: upper-left. Higher prod → right within zone, higher CF → up.
      const relProd = lpP > 0 ? Math.min(1, prod / lpP) : 0.5;
      const relCF = lcfCF < 10 ? Math.min(1, (cf - lcfCF) / (10 - lcfCF)) : 0.5;
      return {
        cx: PAD.left + padding + relProd * (lpLineX - PAD.left - padding * 2),
        cy: PAD.top + padding + (1 - relCF) * (lcfLineY - PAD.top - padding * 2),
      };
    }
    if (cat === "LCF") {
      // LCF zone: bottom band. Spread by productivity (X) and culture fit (Y).
      const relProd = Math.min(1, prod / 10);
      const relCF = lcfCF > 0 ? Math.min(1, cf / lcfCF) : 0.5;
      return {
        cx: PAD.left + padding + relProd * (W - padding * 2),
        cy: lcfLineY + padding + (1 - relCF) * (bottom - lcfLineY - padding * 2),
      };
    }
    // MP zone: middle area. Spread proportionally.
    const relProd = (lpP < hpP) ? Math.min(1, (prod - lpP) / (hpP - lpP)) : 0.5;
    const relCF = (lcfCF < hpCF) ? Math.min(1, (cf - lcfCF) / (hpCF - lcfCF)) : 0.5;
    // MP has two visual blocks — use the main center one
    return {
      cx: lpLineX + padding + relProd * (hpPLineX - lpLineX - padding * 2),
      cy: PAD.top + padding + (1 - relCF) * (lcfLineY - PAD.top - padding * 2),
    };
  }

  // Group assessments by plotted pixel for overlap detection. Using the
  // literal score as the key misses collisions when the MP/HP/LP/LCF zone
  // positioners clamp two different scores to the same (cx, cy) — e.g., two
  // MP members whose CF both exceeds hpCF land at the same Y because the
  // relCF formula clamps at 1.0. Grouping by rounded pixel catches those.
  const grouped: Record<string, Assessment[]> = {};
  for (const a of assessments) {
    const { cx, cy } = positionDot(a);
    const key = `${Math.round(cx)},${Math.round(cy)}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
        className="w-full max-w-[600px]"
        style={{ minWidth: 300 }}
      >
        {/* Zone backgrounds */}
        {/* LCF — bottom band, full width */}
        <rect x={PAD.left} y={lcfLineY} width={W} height={bottom - lcfLineY} fill={ZONE_BG.LCF} />

        {/* LP — upper left (above LCF, left of lpP) */}
        <rect x={PAD.left} y={PAD.top} width={lpLineX - PAD.left} height={lcfLineY - PAD.top} fill={ZONE_BG.LP} />

        {/* HP — upper right corner (above hpCF, right of hpP) */}
        <rect x={hpPLineX} y={PAD.top} width={right - hpPLineX} height={hpCFLineY - PAD.top} fill={ZONE_BG.HP} />

        {/* MP — middle (everything else above LCF that isn't LP or HP) */}
        {/* MP block 1: between LP and HP horizontally, above LCF */}
        <rect x={lpLineX} y={PAD.top} width={hpPLineX - lpLineX} height={lcfLineY - PAD.top} fill={ZONE_BG.MP} />
        {/* MP block 2: right column below HP threshold line */}
        <rect x={hpPLineX} y={hpCFLineY} width={right - hpPLineX} height={lcfLineY - hpCFLineY} fill={ZONE_BG.MP} />

        {/* Outer border */}
        <rect x={PAD.left} y={PAD.top} width={W} height={H} fill="none" stroke="#212121" strokeWidth={1.5} />

        {/* Threshold lines */}
        {/* LCF horizontal line — full width */}
        <line x1={PAD.left} y1={lcfLineY} x2={right} y2={lcfLineY} stroke="#212121" strokeWidth={1.5} />

        {/* LP vertical line — from top to LCF line */}
        <line x1={lpLineX} y1={PAD.top} x2={lpLineX} y2={lcfLineY} stroke="#212121" strokeWidth={1} />

        {/* HP productivity vertical line — from top to HP CF line */}
        <line x1={hpPLineX} y1={PAD.top} x2={hpPLineX} y2={hpCFLineY} stroke="#212121" strokeWidth={1} />

        {/* HP culture fit horizontal line — from HP prod line to right */}
        <line x1={hpPLineX} y1={hpCFLineY} x2={right} y2={hpCFLineY} stroke="#212121" strokeWidth={1} />

        {/* Zone labels */}
        <text x={(hpPLineX + right) / 2} y={(PAD.top + hpCFLineY) / 2 + 6}
          textAnchor="middle" fontSize={16} fontWeight={700} fill="#212121" opacity={0.20}>
          High Performing
        </text>
        <text x={(PAD.left + lpLineX) / 2} y={(PAD.top + lcfLineY) / 2 + 6}
          textAnchor="middle" fontSize={14} fontWeight={700} fill="#212121" opacity={0.20}>
          Low Producing
        </text>
        <text x={(lpLineX + hpPLineX) / 2} y={(PAD.top + lcfLineY) / 2}
          textAnchor="middle" fontSize={15} fontWeight={700} fill="#212121" opacity={0.20}>
          Medium
        </text>
        <text x={(lpLineX + hpPLineX) / 2} y={(PAD.top + lcfLineY) / 2 + 18}
          textAnchor="middle" fontSize={15} fontWeight={700} fill="#212121" opacity={0.20}>
          Performing
        </text>
        <text x={PAD.left + W / 2} y={(lcfLineY + bottom) / 2 + 6}
          textAnchor="middle" fontSize={15} fontWeight={700} fill="#212121" opacity={0.20}>
          Low Culture Fit
        </text>

        {/* Axis labels */}
        <text x={PAD.left + W / 2} y={TOTAL_H - 5}
          textAnchor="middle" fontSize={13} fontWeight={700} fill="#212121" letterSpacing={2}>
          PRODUCTIVITY
        </text>
        <text x={14} y={PAD.top + H / 2}
          textAnchor="middle" fontSize={13} fontWeight={700} fill="#212121" letterSpacing={2}
          transform={`rotate(-90, 14, ${PAD.top + H / 2})`}>
          CULTURE FIT
        </text>

        {/* Axis values at corners */}
        <text x={PAD.left - 8} y={PAD.top + 5} textAnchor="end" fontSize={11} fill="#9ca3af">10</text>
        <text x={PAD.left - 8} y={bottom + 4} textAnchor="end" fontSize={11} fill="#9ca3af">0</text>
        <text x={right} y={TOTAL_H - 25} textAnchor="middle" fontSize={11} fill="#9ca3af">10</text>

        {/* Assessment dots */}
        {Object.entries(grouped).map(([, group]) => {
          const a = group[0];
          const pos = positionDot(a);
          const cx = pos.cx;
          const cy = pos.cy;
          const hasOverlap = group.length > 1;

          return group.map((assessment, idx) => {
            const isHovered = hoveredId === assessment.id;
            const fill = CATEGORY_FILL[assessment.performanceCategory] ?? "#9ca3af";
            // Offset overlapping dots slightly
            const offsetX = hasOverlap ? (idx - (group.length - 1) / 2) * 10 : 0;
            const dotCx = cx + offsetX;

            return (
              <g
                key={assessment.id}
                onMouseEnter={() => setHoveredId(assessment.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onClickMember?.(assessment.memberId)}
                style={{ cursor: onClickMember ? "pointer" : "default" }}
              >
                <circle
                  cx={dotCx} cy={cy} r={isHovered ? 16 : 14}
                  fill={fill}
                  stroke={isHovered ? "#212121" : "white"}
                  strokeWidth={isHovered ? 2 : 1.5}
                  opacity={0.9}
                />
                {!privacyMode && (
                  <text
                    x={dotCx} y={cy + 4}
                    textAnchor="middle" fontSize={9} fontWeight={600} fill="white"
                    pointerEvents="none"
                  >
                    {getInitials(assessment.memberName)}
                  </text>
                )}

                {/* Overlap count badge */}
                {hasOverlap && idx === 0 && (
                  <g>
                    <circle cx={dotCx + 12} cy={cy - 12} r={8} fill="#212121" />
                    <text x={dotCx + 12} y={cy - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill="white">
                      {group.length}
                    </text>
                  </g>
                )}

                {/* Tooltip */}
                {isHovered && !privacyMode && (() => {
                  const ttW = 190;
                  const ttH = 52;
                  const showLeft = dotCx + 18 + ttW > TOTAL_W;
                  const showBelow = cy - 30 < 0;
                  const tx = showLeft ? dotCx - 18 - ttW : dotCx + 18;
                  const ty = showBelow ? cy + 20 : cy - 30;
                  return (
                    <g>
                      <rect
                        x={tx} y={ty}
                        width={ttW} height={ttH}
                        rx={4} fill="#212121" opacity={0.95}
                      />
                      <text x={tx + 8} y={ty + 18} fontSize={11} fontWeight={600} fill="white">
                        {assessment.memberName}
                      </text>
                      <text x={tx + 8} y={ty + 32} fontSize={10} fill="#9ca3af">
                        CF: {assessment.cultureFitScore.toFixed(1)} · Prod: {assessment.productivityScore.toFixed(1)}
                      </text>
                      <text x={tx + 8} y={ty + 44} fontSize={10} fill={fill}>
                        {CATEGORY_LABELS[assessment.performanceCategory]}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
}
