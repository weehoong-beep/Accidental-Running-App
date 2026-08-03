import type { ReactNode } from 'react'

/** Card-wrapped group with an uppercase heading. Shared by Settings and Profile. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card mt-4 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  )
}

/** Read-only label/value pair. */
export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

/** Labelled control row, for inputs and selects inside a Section. */
export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="text-xs text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'mt-1 w-full rounded-xl bg-bg-800 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-white/25'
