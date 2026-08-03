import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'

export function Auth() {
  const { signInWithPassword, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [signedUp, setSignedUp] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res =
      mode === 'signin' ? await signInWithPassword(email, password) : await signUp(email, password, fullName)
    setBusy(false)
    if (res.error) {
      setError(res.error)
    } else if (mode === 'signup') {
      setSignedUp(true)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 safe-top safe-bottom">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-accent-gradient shadow-glow" />
          <h1 className="text-2xl font-extrabold tracking-tight">Accidental Running App</h1>
          <p className="mt-1 text-sm text-slate-400">Your half marathon training tracker</p>
        </div>

        {signedUp ? (
          <div className="card p-5 text-center">
            <p className="font-semibold">Check your email</p>
            <p className="mt-1 text-sm text-slate-400">
              We sent a confirmation link to <span className="text-slate-200">{email}</span>. Confirm it, then sign in below.
            </p>
            <button
              className="mt-4 w-full rounded-xl bg-white/5 py-2.5 text-sm font-medium"
              onClick={() => {
                setSignedUp(false)
                setMode('signin')
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-3 p-5">
            {mode === 'signup' && (
              <input
                className="w-full rounded-xl bg-bg-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-accent-purple"
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            )}
            <input
              type="email"
              className="w-full rounded-xl bg-bg-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-accent-purple"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="w-full rounded-xl bg-bg-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-accent-purple"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={busy}
              className="w-full rounded-xl bg-accent-gradient py-3 text-sm font-semibold text-black disabled:opacity-60"
              type="submit"
            >
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </motion.button>
            <button
              type="button"
              className="w-full text-center text-xs text-slate-400"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  )
}
