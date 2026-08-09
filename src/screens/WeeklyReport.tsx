import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { format } from 'date-fns'
import type { TrainingPlan } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useAnalyzeWeek, useRaceEvent, useWeeklyReport } from '@/lib/queries'
import type {
  CadenceSummary,
  ElevationPaceCorrelation,
  HrZoneBreakdown,
  KeyStats,
  RecoveryPattern,
  RunSplitsSummary,
  SessionAdherence,
  StatStatus,
  WeekTrendPoint,
  WeeklyReport as WeeklyReportData
} from '@/lib/weeklyReport'
import { durationToString, paceToString } from '@/lib/format'
import { hasWebGL } from '@/lib/webgl'
import { PageTransition } from '@/components/layout/PageTransition'
import { AnimatedCounter } from '@/components/report/AnimatedCounter'
import { RibbonFallback } from '@/components/report/RibbonFallback'
import { LineChart } from '@/components/charts/LineChart'
import type { ColorMode } from '@/components/report/buildRibbonGeometry'

// Loaded once, outside the component, so React.lazy doesn't re-create (and
// re-request) the three.js chunk on every render.
const RouteRibbon3DLazy = lazy(() => import('@/components/report/RouteRibbon3D'))

export function WeeklyReport({ plan }: { plan: TrainingPlan }) {
  const { weekIndex: weekIndexParam } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const weekIndex = Number(weekIndexParam)

  const { data: raceEvent } = useRaceEvent(plan.race_event_id)
  const { data: report, isLoading, isFetchingStreams } = useWeeklyReport(
    plan.id,
    Number.isFinite(weekIndex) ? weekIndex : undefined,
    user?.id,
    raceEvent ?? null
  )
  const analyzeWeek = useAnalyzeWeek()
  const [colorMode, setColorMode] = useState<ColorMode>('pace')
  const reduceMotion = useReducedMotion()
  const webglAvailable = useMemo(() => hasWebGL(), [])

  const ribbonSectionRef = useRef<HTMLDivElement>(null)
  const ribbonInView = useInView(ribbonSectionRef, { margin: '200px 0px', once: true })

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent-purple" />
      </div>
    )
  }

  if (!report) {
    return (
      <PageTransition>
        <div className="px-5 pt-6 safe-top">
          <BackButton onClick={() => navigate(-1)} />
          <div className="card mt-4 p-5 text-center">
            <p className="font-semibold">This week isn't complete yet</p>
            <p className="mt-1 text-sm text-slate-400">Finish every session to unlock its report.</p>
          </div>
        </div>
      </PageTransition>
    )
  }

  const canAnimate3D = !reduceMotion
  const use3D = webglAvailable && report.routeRibbons.length > 0

  return (
    <PageTransition>
      <div className="px-5 pt-6 pb-10 safe-top">
        <BackButton onClick={() => navigate(-1)} />

        <motion.div layoutId={`week-${weekIndex}`} className="rounded-3xl bg-gradient-to-br from-accent-purple/30 via-accent-teal/10 to-transparent p-5">
          <p className="text-xs text-slate-300">
            {report.startDate && format(new Date(report.startDate + 'T00:00:00'), 'MMM d')} –{' '}
            {report.endDate && format(new Date(report.endDate + 'T00:00:00'), 'MMM d')}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">Week {weekIndex} Report</h1>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <HeroStat label="Distance">
              <AnimatedCounter value={report.hero.totalDistanceM / 1000} format={(v) => `${v.toFixed(1)} km`} />
            </HeroStat>
            <HeroStat label="Time">{durationToString(report.hero.totalMovingTimeSec)}</HeroStat>
            <HeroStat label="Avg pace">{paceToString(report.hero.avgPaceSecPerKm)}</HeroStat>
            <HeroStat label="Elevation">
              <AnimatedCounter value={report.hero.totalElevationGainM} format={(v) => `${Math.round(v)} m`} delay={0.1} />
            </HeroStat>
          </div>
        </motion.div>

        <KeyStatsSection keyStats={report.keyStats} />

        <div ref={ribbonSectionRef} className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Route</p>
            {use3D && report.dataQuality.hasHeartRateData && (
              <div className="flex gap-1">
                <ToggleButton active={colorMode === 'pace'} onClick={() => setColorMode('pace')}>
                  Pace
                </ToggleButton>
                <ToggleButton active={colorMode === 'hr'} onClick={() => setColorMode('hr')}>
                  HR
                </ToggleButton>
              </div>
            )}
          </div>

          {use3D ? (
            ribbonInView ? (
              <Suspense fallback={<RibbonSkeleton />}>
                <RouteRibbon3DLazy ribbons={report.routeRibbons} colorMode={colorMode} animate={canAnimate3D} />
              </Suspense>
            ) : (
              <RibbonSkeleton />
            )
          ) : (
            <RibbonFallback ribbons={report.routeRibbons} />
          )}

          {isFetchingStreams && (
            <p className="mt-2 text-center text-[10px] text-slate-500">Fetching full-resolution route data…</p>
          )}
          {report.routeRibbons.length > 0 && report.dataQuality.hasStreamData === false && (
            <p className="mt-2 text-center text-[10px] text-slate-500">
              Showing an approximate route — full-resolution GPS data isn't available for every run this week.
            </p>
          )}
        </div>

        <NarrativeSection
          report={report}
          pending={analyzeWeek.isPending}
          error={analyzeWeek.error instanceof Error ? analyzeWeek.error.message : null}
          onGenerate={() => analyzeWeek.mutate({ planId: plan.id, weekIndex })}
        />

        <SplitsSection splits={report.splits} />
        <HrZoneSection hrZones={report.hrZones} />
        <ElevationPaceSection ep={report.elevationPace} />
        <TrendSection trend={report.trend} totalLoad={report.trainingLoad.totalLoad} />
        <RecoverySection recovery={report.recovery} />
        <AdherenceSection adherence={report.planAdherence} />

        {report.personalBests.length > 0 && (
          <Section title="Personal bests this week">
            <div className="space-y-2">
              {report.personalBests.map((pr) => (
                <div key={pr.distanceLabel} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span className="font-semibold text-accent-amber">{pr.distanceLabel}</span>
                  <span className="text-slate-300">{durationToString(pr.timeSec)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {report.cadence && <CadenceSection cadence={report.cadence} />}
      </div>
    </PageTransition>
  )
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-3 flex items-center gap-1 text-sm text-slate-400">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  )
}

function HeroStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-black/20 p-3.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold">{children}</p>
    </div>
  )
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
        active ? 'bg-accent-purple text-white' : 'bg-white/5 text-slate-400'
      }`}
    >
      {children}
    </button>
  )
}

function RibbonSkeleton() {
  return (
    <div className="flex h-72 w-full items-center justify-center rounded-2xl bg-bg-900">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-accent-teal" />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mt-4 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  )
}

const STATUS_EMOJI: Record<StatStatus, string> = { good: '🟢', warn: '🟡', bad: '🔴' }
const TREND_ARROW: Record<NonNullable<KeyStats['easyPace']['trend']>, string> = { up: '↑', down: '↓', flat: '→' }

function KeyStatsSection({ keyStats }: { keyStats: KeyStats }) {
  const easyPaceLabel =
    keyStats.easyPace.paceSecPerKm != null
      ? `${paceToString(Math.round(keyStats.easyPace.paceSecPerKm))}${
          keyStats.easyPace.avgHr != null ? ` @ ${Math.round(keyStats.easyPace.avgHr)} bpm` : ''
        }${keyStats.easyPace.trend ? ` ${TREND_ARROW[keyStats.easyPace.trend]}` : ''}`
      : '—'

  return (
    <Section title="Week at a glance">
      <div className="space-y-2 text-sm">
        <StatRow label="Mileage" value={`${keyStats.mileageKm.toFixed(1)} / ${keyStats.mileageTargetKm.toFixed(1)} km`} status={keyStats.mileageStatus} />
        <StatRow label="Runs" value={`${keyStats.runsCompleted} / ${keyStats.runsPlanned}`} status={keyStats.runsStatus} />
        {keyStats.avgEasyHr != null && <StatRow label="Avg HR (easy runs)" value={`${Math.round(keyStats.avgEasyHr)} bpm`} />}
        {keyStats.longRun && (
          <StatRow
            label="Long run"
            value={`${metersToKmLabel(keyStats.longRun.distanceM)} km${
              keyStats.longRun.paceSecPerKm != null ? ` @ ${paceToString(Math.round(keyStats.longRun.paceSecPerKm))}` : ''
            }`}
          />
        )}
        {keyStats.restingHr != null && <StatRow label="Resting HR" value={`${keyStats.restingHr} bpm`} />}
        {keyStats.marathonReadinessPct != null && (
          <StatRow label="Marathon readiness" value={`${Math.round(keyStats.marathonReadinessPct)}%`} />
        )}
        <StatRow label="Easy pace" value={easyPaceLabel} />
        {keyStats.qualitySessions.map((q, i) => (
          <StatRow key={i} label="Quality" value={q.label} />
        ))}
        <StatRow label="Elevation gain" value={`${Math.round(keyStats.elevationGainM)} m`} />
        {keyStats.avgRpe != null && <StatRow label="Avg RPE" value={`${keyStats.avgRpe.toFixed(1)}/10`} />}
      </div>
    </Section>
  )
}

function metersToKmLabel(m: number): string {
  return (m / 1000).toFixed(1)
}

function StatRow({ label, value, status }: { label: string; value: string; status?: StatStatus }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-100">
        {value}
        {status && <span className="ml-1.5">{STATUS_EMOJI[status]}</span>}
      </span>
    </div>
  )
}

function NarrativeSection({
  report,
  pending,
  error,
  onGenerate
}: {
  report: WeeklyReportData
  pending: boolean
  error: string | null
  onGenerate: () => void
}) {
  return (
    <Section title="AI weekly summary">
      {report.narrative ? (
        <p className="whitespace-pre-line text-sm text-slate-200">{report.narrative.content}</p>
      ) : (
        <p className="text-sm text-slate-500">No summary generated yet for this week.</p>
      )}
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onGenerate}
        disabled={pending}
        className="mt-3 w-full rounded-xl bg-white/8 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? 'Generating…' : report.narrative ? 'Regenerate summary' : 'Generate summary'}
      </motion.button>
    </Section>
  )
}

function SplitsSection({ splits }: { splits: RunSplitsSummary[] }) {
  if (splits.length === 0) return null
  return (
    <Section title="Pace consistency">
      <div className="space-y-2.5">
        {splits.map((s) => (
          <div key={s.activityId} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">{format(new Date(s.date + 'T00:00:00'), 'EEE, MMM d')}</span>
            {s.paceConsistencyCv != null ? (
              <span className="text-slate-400">
                {(s.paceConsistencyCv * 100).toFixed(1)}% pace variance
                {s.paceConsistencyCv < 0.04 && <span className="ml-1 text-emerald-400">· flat</span>}
              </span>
            ) : s.negativeSplitSec != null ? (
              <span className={s.negativeSplitSec < 0 ? 'text-emerald-400' : 'text-slate-400'}>
                {s.negativeSplitSec < 0 ? 'Negative split' : 'Positive split'} · {Math.abs(Math.round(s.negativeSplitSec))}s/km
              </span>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

const ZONE_COLORS: Record<string, string> = {
  Z1: '#2DD4BF',
  Z2: '#8B6BFF',
  Z3: '#FFB454',
  Z4: '#FF7A59',
  Z5: '#F43F5E'
}

function HrZoneSection({ hrZones }: { hrZones: HrZoneBreakdown }) {
  if (hrZones.method === 'unavailable' || hrZones.zones.length === 0) return null
  return (
    <Section title="Heart rate zones">
      <div className="space-y-2">
        {hrZones.zones.map((z) => (
          <div key={z.short} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-[10px] font-medium text-slate-300">{z.short}</span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: ZONE_COLORS[z.short] ?? '#8B6BFF' }}
                initial={{ width: 0 }}
                animate={{ width: `${z.pct}%` }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-[10px] text-slate-500">{z.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        {hrZones.method === 'split-weighted' ? 'Estimated from per-kilometre splits.' : 'Estimated from per-run averages.'}
      </p>
    </Section>
  )
}

function ElevationPaceSection({ ep }: { ep: ElevationPaceCorrelation }) {
  if (ep.method === 'insufficient-data' && ep.gradeAdjustedAvgPaceSecPerKm == null) return null
  return (
    <Section title="Elevation vs. pace">
      {ep.method !== 'insufficient-data' && ep.pearsonR != null ? (
        <p className="text-sm text-slate-300">
          Correlation: <span className="font-semibold">{ep.pearsonR.toFixed(2)}</span>{' '}
          <span className="text-slate-500">({ep.sampleSize} samples)</span>
        </p>
      ) : (
        <p className="text-sm text-slate-500">Not enough data yet to correlate elevation and pace this week.</p>
      )}
      {ep.gradeAdjustedAvgPaceSecPerKm != null && (
        <p className="mt-1 text-xs text-slate-400">
          Grade-adjusted avg pace: <span className="font-semibold text-slate-200">{paceToString(Math.round(ep.gradeAdjustedAvgPaceSecPerKm))}</span>
        </p>
      )}
    </Section>
  )
}

function TrendSection({ trend, totalLoad }: { trend: WeekTrendPoint[]; totalLoad: number }) {
  if (trend.length === 0) return null
  const kmPoints = trend.map((t) => ({ x: t.weekIndex, y: t.km }))
  const pacePoints = trend
    .filter((t) => t.avgPaceSecPerKm != null)
    .map((t) => ({ x: t.weekIndex, y: t.avgPaceSecPerKm as number }))

  return (
    <Section title="Trend vs. prior weeks">
      <p className="mb-2 text-xs text-slate-500">Weekly distance (km)</p>
      <LineChart points={kmPoints} height={90} formatY={(v) => `${v.toFixed(1)} km`} />
      {pacePoints.length > 1 && (
        <>
          <p className="mb-2 mt-4 text-xs text-slate-500">Average pace</p>
          <LineChart points={pacePoints} height={90} invertY formatY={(v) => paceToString(v)} />
        </>
      )}
      <p className="mt-3 text-xs text-slate-400">
        This week's training load: <span className="font-semibold text-slate-200">{Math.round(totalLoad)}</span>
      </p>
    </Section>
  )
}

function RecoverySection({ recovery }: { recovery: RecoveryPattern }) {
  return (
    <Section title="Recovery">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <RecoveryStat label="Rest days taken" value={`${recovery.restDaysTaken}/${recovery.restDaysPlanned}`} />
        <RecoveryStat label="Active recovery" value={`${recovery.activeRecoveryDays}`} />
        <RecoveryStat label="Longest run streak" value={`${recovery.longestRunStreakDays}d`} />
        <RecoveryStat
          label="Hard-session spacing"
          value={recovery.minGapBetweenHardSessionsDays != null ? `${recovery.minGapBetweenHardSessionsDays}d min` : '—'}
        />
      </div>
    </Section>
  )
}

function RecoveryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}

function AdherenceSection({ adherence }: { adherence: SessionAdherence[] }) {
  if (adherence.length === 0) return null
  const onPace = adherence.filter((a) => a.paceInTarget === true).length
  const withPaceTarget = adherence.filter((a) => a.paceInTarget != null).length
  return (
    <Section title="Plan adherence">
      <p className="text-sm text-slate-300">
        {withPaceTarget > 0 ? (
          <>
            <span className="font-semibold">{onPace}</span> of <span className="font-semibold">{withPaceTarget}</span> runs landed in
            their target pace range.
          </>
        ) : (
          'No pace targets to compare this week.'
        )}
      </p>
    </Section>
  )
}

function CadenceSection({ cadence }: { cadence: CadenceSummary }) {
  return (
    <Section title="Cadence">
      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Avg cadence</p>
          <p className="font-semibold">{Math.round(cadence.avgCadenceSpm)} spm</p>
        </div>
        {cadence.avgStrideLengthM != null && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Avg stride</p>
            <p className="font-semibold">{cadence.avgStrideLengthM.toFixed(2)} m</p>
          </div>
        )}
      </div>
    </Section>
  )
}
