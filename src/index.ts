export * from './types.js';
export * from './util/dates.js';
export { matchActivities, type Match, type MatchResult } from './scoring/match.js';
export { scoreWorkout, EXPECTED_RPE, type ScoreInput, type ScoreResult, type ScoreMetrics } from './scoring/score.js';
export { weeklyBudget, longestBlock, MIN_BLOCK_MIN, REALITY_FACTOR, type Budget } from './calendar/budget.js';
export { phaseWeeks, phaseLengths, PHASE_HOURS, type Goal, type PhaseWeek, type PhaseHours } from './calendar/phases.js';
export { generatePlan, type GenerateInput, type GenerateResult, type WeekPlan } from './calendar/generate.js';
export { adapt, type AdaptEvent, type AdaptContext, type AdaptResult } from './calendar/adapt.js';
export { computeBar, type BarInput, type BarResult, type BarComponent, type ScoredActivity } from './bar/bar.js';
