import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useSearchParams } from 'react-router-dom'
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
import { paceRangeToString } from '@/lib/format'
import { Section } from '@/components/SettingsSection'
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
        <Link to="/profile" className="mt-4 block">
          <div className="card flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold">
                {profile?.full_name ?? user?.email ?? 'Runner profile'}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {profile?.vdot != null
                  ? `VDOT ${profile.vdot} · easy ${paceRangeToString(profile.easy_pace_min_sec, profile.easy_pace_max_sec)}`
                  : 'Add your records, paces and heart rate'}
              </p>
            </div>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-slate-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </Link>

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
              {stravaSync.data && (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  Synced {stravaSync.data.synced} activities, matched {stravaSync.data.matched} to
                  your plan
                  {stravaSync.data.recordsUpdated > 0 &&
                    `, updated ${stravaSync.data.recordsUpdated} personal ${
                      stravaSync.data.recordsUpdated === 1 ? 'record' : 'records'
                    }`}
                  .
                  {stravaSync.data.detailRemaining > 0 && (
                    <>
                      {' '}
                      {stravaSync.data.detailRemaining} more runs still need their splits — sync
                      again to continue (Strava limits how many we can pull at once).
                    </>
                  )}
                </p>
              )}
              {stravaSync.isError && (
                <p className="mt-2 text-[11px] text-rose-400">
                  {(stravaSync.error as Error)?.message ?? 'Sync failed'}
                </p>
              )}
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

