/** Shared badge styling for `TrainingSession.status`, used by SessionCard and SessionDetail. */
export const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  missed: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
  swapped: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
  // Legacy value from before sessions could be swapped in place; kept so older rows still render sensibly.
  rescheduled: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  planned: 'bg-white/5 text-slate-400 border-white/10'
}
