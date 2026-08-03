import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  callFunction,
  useIntegrationSettings,
  useProfile,
  useSaveIntegrationSettings,
  useStravaConnection,
  useStravaDisconnect,
  useStravaSync
} from '@/lib/queries'
import { PageTransition } from '@/components/layout/PageTransition'

const STRAVA_SCOPE = 'read,activity:read_all'

export function Settings() {
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const { data: settings } = useIntegrationSettings(user?.id)
  const { data: connection } = useStravaConnection(user?.id)
  const saveSettings = useSaveIntegrationSettings()
  const stravaSync = useStravaSync()
  const stravaDisconnect = useStravaDisconnect()
  const [searchParams, setSearchParams] = useSearchParams()

  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [exchanging, setExchanging] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setClientId(settings.strava_client_id ?? '')
      setClientSecret(settings.strava_client_secret ?? '')
      setAnthropicKey(settings.anthropic_api_key ?? '')
    }
  }, [settings])

  // Handle the redirect back from Strava (?code=...)
  useEffect(() => {
    const code = searchParams.get('code')
    const errParam = searchParams.get('error')
    if (errParam) {
      setOauthError('Strava authorization was denied or cancelled.')
      setSearchParams({}, { replace: true })
      return
    }
    if (code && !exchanging) {
      setExchanging(true)
      callFunction('strava-oauth', { code, redirect_uri: redirectUri() })
        .then(() => stravaSync.mutate())
        .catch((e) => setOauthError(e.message))
        .finally(() => {
          setExchanging(false)
          setSearchParams({}, { replace: true })
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function redirectUri() {
    return `${window.location.origin}/settings`
  }

  async function handleSaveStrava() {
    if (!user) return
    await saveSettings.mutateAsync({
      user_id: user.id,
      strava_client_id: clientId.trim(),
      strava_client_secret: clientSecret.trim()
    })
    setSavedMsg('Strava credentials saved')
    setTimeout(() => setSavedMsg(null), 2500)
  }

  async function handleSaveAI() {
    if (!user) return
    await saveSettings.mutateAsync({ user_id: user.id, anthropic_api_key: anthropicKey.trim() })
    setSavedMsg('AI key saved')
    setTimeout(() => setSavedMsg(null), 2500)
  }

  function connectStrava() {
    if (!clientId) return
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      approval_prompt: 'auto',
      scope: STRAVA_SCOPE
    })
    window.location.href = `https://www.strava.com/oauth/authorize?${params.toString()}`
  }

  return (
    <PageTransition>
      <div className="px-5 pt-6 pb-10 safe-top">
        <h1 className="text-xl font-extrabold">Settings</h1>

        {/* Profile */}
        <Section title="Profile">
          <Row label="Name" value={profile?.full_name ?? user?.email ?? '—'} />
          <Row label="VDOT" value={profile?.vdot != null ? String(profile.vdot) : '—'} />
          <Row
            label="Threshold pace"
            value={profile?.threshold_pace_sec_per_km ? `${Math.floor(profile.threshold_pace_sec_per_km / 60)}:${(profile.threshold_pace_sec_per_km % 60).toString().padStart(2, '0')}/km` : '—'}
          />
        </Section>

        {/* Strava */}
        <Section title="Strava connection">
          <p className="text-xs leading-relaxed text-slate-400">
            To connect Strava you need a free Strava API application. Go to{' '}
            <a className="text-accent-teal underline" href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">
              strava.com/settings/api
            </a>
            , create an app, and set the <span className="text-slate-200">Authorization Callback Domain</span> to{' '}
            <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">{window.location.hostname}</code>. Then copy the{' '}
            <span className="text-slate-200">Client ID</span> and <span className="text-slate-200">Client Secret</span> shown on that page into the fields below.
          </p>

          <input
            className="mt-3 w-full rounded-xl bg-bg-800 border border-white/10 px-4 py-3 text-sm outline-none"
            placeholder="Strava Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
          <input
            className="mt-2 w-full rounded-xl bg-bg-800 border border-white/10 px-4 py-3 text-sm outline-none"
            placeholder="Strava Client Secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
          />
          <button
            onClick={handleSaveStrava}
            disabled={saveSettings.isPending}
            className="mt-2 w-full rounded-xl bg-white/8 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            Save credentials
          </button>

          {oauthError && <p className="mt-2 text-xs text-rose-400">{oauthError}</p>}
          {exchanging && <p className="mt-2 text-xs text-slate-400">Connecting to Strava…</p>}

          {connection?.athlete_id ? (
            <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
              <p className="text-sm font-medium text-emerald-300">
                Connected as {connection.athlete?.firstname} {connection.athlete?.lastname}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Last synced: {connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : 'never'}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => stravaSync.mutate()}
                  disabled={stravaSync.isPending}
                  className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-black disabled:opacity-60"
                >
                  {stravaSync.isPending ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  onClick={() => user && stravaDisconnect.mutate(user.id)}
                  className="flex-1 rounded-lg bg-white/8 py-2 text-xs font-medium"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={connectStrava}
              disabled={!clientId}
              className="mt-3 w-full rounded-xl bg-[#FC4C02] py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Connect with Strava
            </motion.button>
          )}
        </Section>

        {/* AI */}
        <Section title="AI run analysis">
          <p className="text-xs leading-relaxed text-slate-400">
            Run analysis is powered by Claude (Anthropic). Get an API key from{' '}
            <a className="text-accent-teal underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
              console.anthropic.com/settings/keys
            </a>{' '}
            and paste it below. It's stored securely and only used server-side to analyze your runs.
          </p>
          <input
            className="mt-3 w-full rounded-xl bg-bg-800 border border-white/10 px-4 py-3 text-sm outline-none"
            placeholder="sk-ant-…"
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
          />
          <button
            onClick={handleSaveAI}
            disabled={saveSettings.isPending}
            className="mt-2 w-full rounded-xl bg-white/8 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            Save AI key
          </button>
        </Section>

        {savedMsg && <p className="mt-3 text-center text-xs text-emerald-400">{savedMsg}</p>}

        <button onClick={() => signOut()} className="mt-8 w-full text-center text-xs text-slate-500">
          Sign out
        </button>
      </div>
    </PageTransition>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
