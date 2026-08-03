import type { SessionType } from './types'

/**
 * Terminology and coaching notes for Hal Higdon's Half Marathon Training —
 * Intermediate 2 program. https://www.halhigdon.com/training-programs/half-marathon-training/intermediate-2-half-marathon/
 */
export interface SessionTypeInfo {
  label: string
  short: string
  what: string
  why: string
  howTo: string
  color: string
  gradient: string
}

export const HIGDON_INFO: Record<SessionType, SessionTypeInfo> = {
  cross_train: {
    label: 'Cross-Training',
    short: 'Cross',
    what: 'A non-running aerobic activity — cycling, swimming, rowing, the elliptical, or brisk walking — for roughly 30–60 minutes at an easy, conversational effort.',
    why: 'Higdon schedules cross-training on the day after your long run to keep blood flowing and aid recovery while building general aerobic fitness, without the impact stress of another run.',
    howTo: 'Pick any low-impact cardio you enjoy. Keep the effort easy (you should be able to hold a conversation). Duration matters more than intensity here.',
    color: '#2DD4BF',
    gradient: 'from-accent-teal/30 to-accent-teal/5'
  },
  easy: {
    label: 'Easy Run',
    short: 'Easy',
    what: 'A comfortable, conversational-pace run at your easy training pace.',
    why: 'Easy runs build your aerobic base — the foundation of half-marathon fitness — while keeping cumulative fatigue low enough to absorb the harder tempo, interval, and long-run days.',
    howTo: 'Run at a pace where you could hold a conversation the whole way. If in doubt, go slower rather than faster — Higdon\'s #1 rule for easy days.',
    color: '#8B6BFF',
    gradient: 'from-accent-purple/30 to-accent-purple/5'
  },
  tempo: {
    label: 'Tempo Run',
    short: 'Tempo',
    what: 'A continuous, sustained run (no walk breaks) at a "comfortably hard" effort — roughly your lactate-threshold pace, close to 10K-to-half-marathon race effort.',
    why: 'Tempo runs teach your body to clear lactate faster, raising the pace you can sustain before you fatigue — one of the biggest levers for half-marathon race pace.',
    howTo: 'Warm up, then run the prescribed distance/time at threshold effort — hard, but a pace you could hold for ~20–40 minutes if pushed. Don\'t treat it as an all-out effort.',
    color: '#FF7A59',
    gradient: 'from-accent-coral/30 to-accent-coral/5'
  },
  interval: {
    label: 'Speed Interval',
    short: 'Interval',
    what: 'Short, fast repeats (e.g. 400m) run at approximately your current 5K race pace, each followed by an easy jog or walk recovery of similar distance/time.',
    why: 'Intervals improve running economy, VO2max, and turnover speed — they make your easy and tempo paces feel more manageable as the block progresses.',
    howTo: 'Warm up 10–15 min easy first. Run each repeat at 5K effort — hard but controlled, not a sprint. Jog or walk the recovery fully before starting the next rep. Cool down after the last one.',
    color: '#FFB454',
    gradient: 'from-accent-amber/30 to-accent-amber/5'
  },
  race_pace: {
    label: 'Race-Pace Run',
    short: 'Race Pace',
    what: 'Miles run at your goal half-marathon race pace.',
    why: 'Builds pacing discipline and physical/mental familiarity with exactly how goal race effort should feel, so race day pace judgment is automatic.',
    howTo: 'Warm up easy, then settle into goal race pace for the prescribed distance. Focus on rhythm and relaxed form rather than pushing harder than race effort.',
    color: '#FF7A59',
    gradient: 'from-accent-coral/30 to-accent-coral/5'
  },
  long: {
    label: 'Long Run',
    short: 'Long Run',
    what: 'A slow, steady run at the same easy pace as your easy runs, at the week\'s longest distance.',
    why: 'The single most important run in the program. Long runs build the endurance, fat-burning efficiency, and mental toughness that let you cover 21.1km on race day.',
    howTo: 'Start conservatively — even slower than easy pace is fine. Fuel and hydrate as you would on race day. Consistency (showing up weekly) matters more than speed.',
    color: '#8B6BFF',
    gradient: 'from-accent-purple/40 to-accent-teal/10'
  },
  race: {
    label: 'Race Day',
    short: 'Race',
    what: 'The half marathon itself — 21.1km.',
    why: 'This is the goal event the entire 9-week block has been building toward.',
    howTo: 'Trust your training and taper. Start conservatively, settle into goal race pace once warmed up, and save something for the last 5K.',
    color: '#FF7A59',
    gradient: 'from-accent-coral/40 to-accent-amber/20'
  },
  rest: {
    label: 'Rest Day',
    short: 'Rest',
    what: 'A complete day off from running — and ideally from hard cross-training too.',
    why: 'Adaptation happens during recovery, not during the workout itself. Skipping rest days is one of the most common ways runners get injured or overtrained.',
    howTo: 'Take the day off. Light stretching, mobility work, or an easy walk is fine, but don\'t treat this as a training day.',
    color: '#64748B',
    gradient: 'from-slate-500/20 to-slate-500/5'
  }
}

export function sessionTypeInfo(type: SessionType): SessionTypeInfo {
  return HIGDON_INFO[type] ?? HIGDON_INFO.easy
}
