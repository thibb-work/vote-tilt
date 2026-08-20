'use client';

import { polar, sectorPath, wrapLabel } from '@/lib/geometry';
import { WEDGE_COLORS } from '@/lib/constants';
import { WEDGE_COUNT, WEDGE_DEG } from '@/lib/tilt';

const CX = 200;
const CY = 200;
const R_INNER = 70;
const R_OUTER = 190;
const R_LABEL = 106;
const R_COUNT = 154;
/** How far the chosen wedge pops out of the ring. */
const POP = 9;

export interface DialProps {
  options: string[];
  counts: number[];
  active: number | null;
  heading: number | null;
  magnitude: number;
  total: number;
  showCounts: boolean;
}

export function Dial({
  options,
  counts,
  active,
  heading,
  magnitude,
  total,
  showCounts,
}: DialProps) {
  // The needle rides from the hub edge outward in proportion to how hard the
  // phone is tilted, so a gentle lean reads differently from a firm commit.
  const reach = Math.min(1, magnitude / 45);
  const needle =
    heading === null ? null : polar(CX, CY, R_INNER + reach * (R_OUTER - R_INNER - 22), heading);

  return (
    <svg className="dial" viewBox="0 0 400 400" role="img" aria-label="Tilt dial">
      {Array.from({ length: WEDGE_COUNT }, (_, w) => {
        const centre = w * WEDGE_DEG;
        const colour = WEDGE_COLORS[w];
        const isActive = active === w;
        const label = options[w] ?? '';
        const lines = wrapLabel(label, 12);

        const pop = polar(0, 0, POP, centre);
        const labelAt = polar(CX, CY, R_LABEL, centre);
        const countAt = polar(CX, CY, R_COUNT, centre);
        const text = isActive ? '#140a1e' : 'rgba(255,255,255,0.9)';

        return (
          <g
            key={w}
            className={`sector${isActive ? ' is-active' : ''}`}
            style={{ transform: isActive ? `translate(${pop.x}px, ${pop.y}px)` : 'none' }}
          >
            <path
              className="sector-fill"
              d={sectorPath(CX, CY, R_INNER, R_OUTER, centre - WEDGE_DEG / 2 + 1.2, centre + WEDGE_DEG / 2 - 1.2)}
              fill={colour}
              fillOpacity={0.16}
              stroke={colour}
              strokeOpacity={isActive ? 0 : 0.45}
              strokeWidth={1.5}
            />

            {showCounts && (
              <text
                className="sector-count tabular"
                x={countAt.x}
                y={countAt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isActive ? text : colour}
                opacity={counts[w] ? 1 : 0.35}
              >
                {counts[w] ?? 0}
              </text>
            )}

            <text
              className="sector-label"
              x={labelAt.x}
              y={labelAt.y - ((lines.length - 1) * 15) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={text}
            >
              {lines.map((line, i) => (
                <tspan key={i} x={labelAt.x} dy={i === 0 ? 0 : 15}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}

      <circle cx={CX} cy={CY} r={R_INNER - 4} fill="#0a0612" />
      <circle
        className={active === null ? 'hub-ring' : undefined}
        cx={CX}
        cy={CY}
        r={R_INNER - 4}
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={2}
        strokeDasharray="4 7"
      />

      <text
        className="hub-label tabular"
        x={CX}
        y={CY - 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize={40}
      >
        {total}
      </text>
      <text
        x={CX}
        y={CY + 22}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize={11}
        letterSpacing="2.4"
      >
        {total === 1 ? 'PHONE' : 'PHONES'}
      </text>

      {needle && (
        <>
          <line
            x1={CX}
            y1={CY}
            x2={needle.x}
            y2={needle.y}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={needle.x} cy={needle.y} r={10} fill="#fff" />
        </>
      )}
    </svg>
  );
}
