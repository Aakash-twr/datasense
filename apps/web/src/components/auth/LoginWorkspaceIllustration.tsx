import React from 'react'
import { Check, Sparkles } from 'lucide-react'

/**
 * Architectural studio preview for the DataSense login brand panel.
 * Uses strictly illustrative sample figures clearly labeled as a preview.
 */
export const LoginWorkspaceIllustration: React.FC = () => {
  const sampleBars = [
    { label: 'Q1', height: 24, value: '1.2M' },
    { label: 'Q2', height: 34, value: '1.6M' },
    { label: 'Q3', height: 42, value: '1.9M' },
    { label: 'Q4', height: 56, value: '2.4M' },
  ]

  const workflowStages = [
    { label: 'Discovery', state: 'done' },
    { label: 'SQL Analyst', state: 'done' },
    { label: 'Approved', state: 'active' },
    { label: 'Insights', state: 'ready' },
  ] as const

  return (
    <div
      aria-hidden="true"
      className="relative w-full overflow-hidden rounded-2xl border border-white/[0.11] bg-[#0B1424]/90 text-left text-slate-200 shadow-[0_24px_60px_-15px_rgba(2,6,23,0.75),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
    >
      {/* Window / Studio Context Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] bg-white/[0.025] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/15" />
            <span className="h-2 w-2 rounded-full bg-white/15" />
            <span className="h-2 w-2 rounded-full bg-white/15" />
          </div>
          <span className="h-3.5 w-px bg-white/10" />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#159A95]" />
            <span className="truncate font-mono text-[11px] font-medium text-slate-200">
              enterprise_revenue.parquet
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium tracking-tight text-slate-400">
          Illustrative Preview
        </span>
      </div>

      {/* Natural Language Copilot Prompt Strip */}
      <div className="mx-3.5 mt-3.5 flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#38BDF8]" />
          <span className="truncate text-[11px] text-slate-300">
            Analyze quarterly enterprise revenue &amp; margin trend
          </span>
        </div>
        <span className="shrink-0 rounded-md border border-[#16A36A]/30 bg-[#16A36A]/10 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-[#34D399]">
          DuckDB • 14ms
        </span>
      </div>

      {/* Center Split: SQL Studio + Analytical Area Chart */}
      <div className="grid grid-cols-12 gap-3 p-3.5">
        {/* Miniature SQL Studio */}
        <div className="col-span-7 flex flex-col justify-between rounded-xl border border-white/[0.07] bg-[#070E1A] p-3 font-mono text-[10px] leading-[1.65]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              SQL Draft
            </span>
            <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-[#34D399]">
              <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
              Validated
            </span>
          </div>

          <div className="space-y-0.5 text-slate-300">
            <div className="flex gap-2.5">
              <span className="select-none text-slate-600">1</span>
              <span>
                <span className="text-[#60A5FA]">SELECT</span> quarter,
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="select-none text-slate-600">2</span>
              <span className="pl-2">
                <span className="text-[#38BDF8]">SUM</span>(revenue){' '}
                <span className="text-[#60A5FA]">AS</span> total
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="select-none text-slate-600">3</span>
              <span>
                <span className="text-[#60A5FA]">FROM</span> sales_orders
              </span>
            </div>
            <div className="flex gap-2.5">
              <span className="select-none text-slate-600">4</span>
              <span>
                <span className="text-[#60A5FA]">GROUP BY</span> quarter;
              </span>
            </div>
          </div>
        </div>

        {/* Miniature Analytics Chart */}
        <div className="col-span-5 flex flex-col justify-between rounded-xl border border-white/[0.07] bg-gradient-to-b from-[#112039] to-[#0D192E] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Quarterly
            </span>
            <span className="rounded bg-[#159A95]/15 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[#2DD4BF]">
              +24.1%
            </span>
          </div>

          <svg viewBox="0 0 132 78" className="mt-1.5 h-[72px] w-full" role="presentation">
            <defs>
              <linearGradient id="dsLoginAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#159A95" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#159A95" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="dsLoginBarPeak" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60A5FA" />
                <stop offset="100%" stopColor="#356AE6" />
              </linearGradient>
            </defs>

            {/* Subtle dashed horizontal reference lines */}
            <line
              x1="6"
              y1="20"
              x2="126"
              y2="20"
              stroke="rgba(148,163,184,0.14)"
              strokeWidth="0.75"
              strokeDasharray="2 2"
            />
            <line
              x1="6"
              y1="42"
              x2="126"
              y2="42"
              stroke="rgba(148,163,184,0.14)"
              strokeWidth="0.75"
              strokeDasharray="2 2"
            />
            <line x1="6" y1="64" x2="126" y2="64" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />

            {/* Soft area fill under trend curve */}
            <polygon
              points="21,64 21,40 50,30 79,22 108,8 108,64"
              fill="url(#dsLoginAreaGrad)"
            />

            {/* Quarterly bars */}
            {sampleBars.map((bar, idx) => {
              const x = 14 + idx * 29
              const y = 64 - bar.height
              const isLatest = idx === sampleBars.length - 1
              return (
                <g key={bar.label}>
                  <rect
                    x={x}
                    y={y}
                    width="14"
                    height={bar.height}
                    rx="3"
                    fill={isLatest ? 'url(#dsLoginBarPeak)' : 'rgba(53, 106, 230, 0.28)'}
                  />
                  <text
                    x={x + 7}
                    y="75"
                    textAnchor="middle"
                    fill={isLatest ? '#CBD5E1' : '#64748B'}
                    fontSize="8"
                    fontFamily="ui-monospace, monospace"
                  >
                    {bar.label}
                  </text>
                </g>
              )
            })}

            {/* Trend line + highlighted Q4 marker */}
            <polyline
              fill="none"
              stroke="#2DD4BF"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              points="21,40 50,30 79,22 108,8"
            />
            <circle cx="108" cy="8" r="4" fill="rgba(45, 212, 191, 0.25)" />
            <circle cx="108" cy="8" r="2.2" fill="#2DD4BF" />
          </svg>
        </div>
      </div>

      {/* Connected Multi-Agent Pipeline Strip */}
      <div className="mx-3.5 mb-3.5 flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
        <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
          Pipeline
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {workflowStages.map((stage, idx) => (
            <React.Fragment key={stage.label}>
              <div
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  stage.state === 'active'
                    ? 'border border-[#356AE6]/45 bg-[#356AE6]/15 text-slate-100'
                    : 'text-slate-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-1.5 w-1.5 rounded-full',
                    stage.state === 'done'
                      ? 'bg-[#34D399]'
                      : stage.state === 'active'
                        ? 'bg-[#60A5FA] shadow-[0_0_8px_#60A5FA]'
                        : 'bg-[#2DD4BF]',
                  ].join(' ')}
                />
                <span>{stage.label}</span>
              </div>
              {idx < workflowStages.length - 1 && (
                <span className="h-px w-2.5 bg-white/15" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Executive Summary Bar */}
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] bg-[#159A95]/[0.07] px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <span className="shrink-0 font-semibold text-[#2DD4BF]">Key Insight</span>
          <span className="truncate text-slate-300">
            Enterprise tier accounted for 64% of Q4 expansion
          </span>
        </div>
        <span className="shrink-0 font-mono text-[11px] font-semibold text-white">$2.4M</span>
      </div>
    </div>
  )
}
