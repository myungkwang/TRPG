import assert from 'node:assert/strict'
import { shouldBlockForBackground } from './dialoguePause.js'

const tried = new Set()

assert.equal(
  shouldBlockForBackground({
    location: '봉우리',
    fixedBackgroundReady: false,
    generatedBackgrounds: {},
    triedLocations: tried,
    isLoading: false,
  }),
  true,
  'unfixed ungenerated locations should block before the async generator flips loading on',
)

assert.equal(
  shouldBlockForBackground({
    location: '봉우리',
    fixedBackgroundReady: false,
    generatedBackgrounds: { 봉우리: '/static/backgrounds/gen/peak.png' },
    triedLocations: tried,
    isLoading: false,
  }),
  false,
  'locations with a generated background should not block',
)

assert.equal(
  shouldBlockForBackground({
    location: '진료소',
    fixedBackgroundReady: true,
    generatedBackgrounds: {},
    triedLocations: tried,
    isLoading: false,
  }),
  false,
  'fixed ready backgrounds should not block',
)

assert.equal(
  shouldBlockForBackground({
    location: '봉우리',
    fixedBackgroundReady: false,
    generatedBackgrounds: {},
    triedLocations: new Set(['봉우리']),
    isLoading: true,
  }),
  true,
  'active generation should block even after the location is marked tried',
)

