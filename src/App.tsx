import { Route, Routes, useLocation } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { BottomNav } from '@/components/layout/BottomNav'
import { Auth } from '@/screens/Auth'
import { Dashboard } from '@/screens/Dashboard'
import { Weekly } from '@/screens/Weekly'
import { WeeklyReport } from '@/screens/WeeklyReport'
import { SessionDetail } from '@/screens/SessionDetail'
import { Training } from '@/screens/Training'
import { Settings } from '@/screens/Settings'
import { Profile } from '@/screens/Profile'
import { Onboarding } from '@/screens/Onboarding'
import { useActivePlan } from '@/lib/queries'

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent-purple" />
      </div>
    )
  }

  if (!user) {
    return <Auth />
  }

  return <AuthedApp userId={user.id} location={location} />
}

function AuthedApp({ userId, location }: { userId: string; location: Location }) {
  const { data: plan, isLoading } = useActivePlan(userId)

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent-purple" />
      </div>
    )
  }

  if (!plan) {
    return <Onboarding />
  }

  return (
    <div className="min-h-screen bg-bg-950 pb-24">
      {/* Both the explicit location and the key are required for AnimatePresence
          to see a route change and run the exit animation. */}
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Dashboard plan={plan} />} />
          <Route path="/weekly" element={<Weekly plan={plan} />} />
          <Route path="/weekly/:weekIndex/report" element={<WeeklyReport plan={plan} />} />
          <Route path="/session/:id" element={<SessionDetail />} />
          <Route path="/training" element={<Training plan={plan} />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </AnimatePresence>
      <BottomNav />
    </div>
  )
}
