import { motion } from 'framer-motion'
import { useState } from 'react'
import { useSeedPlan } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'

export function Onboarding() {
  const { signOut } = useAuth()
  const seedPlan = useSeedPlan()
  const [error, setError] = useState<string | null>(null)

  async function handleSetup() {
    setError(null)
    try {
      await seedPlan.mutateAsync()
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
        <img src="/images/klscm-logo.svg" alt="KLSCM Half Marathon" className="mx-auto mb-5 h-16 w-16 shadow-glow" />
        <h1 className="text-xl font-bold">Set up your training block</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-400">
          We'll load your Hal Higdon Intermediate 2 half-marathon plan — 9 weeks, ending at your KLSCM race day.
        </p>
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSetup}
          disabled={seedPlan.isPending}
          className="mt-6 rounded-xl bg-accent-gradient px-6 py-3 text-sm font-semibold text-black disabled:opacity-60"
        >
          {seedPlan.isPending ? 'Setting up…' : 'Load my training plan'}
        </motion.button>
        <button onClick={() => signOut()} className="mt-4 block w-full text-xs text-slate-500">
          Sign out
        </button>
      </motion.div>
    </div>
  )
}
