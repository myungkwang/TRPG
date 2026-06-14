const SETTINGS_KEY = 'trpg_settings'
export const SETTINGS_EVENT = 'trpg-settings-change'

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  bgmVolume: 0.7,
  sfxVolume: 0.8,
  quality: 'high',
  layout: 'stacked',   // 'split'(가로: 좌 씬/우 대화) | 'stacked'(세로: 원래 상하)
}

export const QUALITY_PRESETS = {
  low: { label: '낮음', pixelRatio: 1 },
  medium: { label: '보통', pixelRatio: 1.5 },
  high: { label: '높음', pixelRatio: 2 },
}

function clamp01(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function normalizeSettings(raw) {
  const rawLayout = raw?.layout || raw?.screenLayout || raw?.orientation
  const layout = ['split', 'landscape', 'horizontal', 'wide'].includes(rawLayout)
    ? 'split'
    : ['stacked', 'portrait', 'vertical', 'tall'].includes(rawLayout)
      ? 'stacked'
      : DEFAULT_SETTINGS.layout

  return {
    masterVolume: clamp01(raw?.masterVolume ?? DEFAULT_SETTINGS.masterVolume),
    bgmVolume: clamp01(raw?.bgmVolume ?? DEFAULT_SETTINGS.bgmVolume),
    sfxVolume: clamp01(raw?.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume),
    quality: QUALITY_PRESETS[raw?.quality] ? raw.quality : DEFAULT_SETTINGS.quality,
    layout,
  }
}

export function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(next) {
  const normalized = normalizeSettings(next)
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: normalized }))
  return normalized
}

export function updateSetting(key, value) {
  return saveSettings({ ...loadSettings(), [key]: value })
}

export function subscribeSettings(callback) {
  const handler = (event) => callback(event.detail || loadSettings())
  window.addEventListener(SETTINGS_EVENT, handler)
  return () => window.removeEventListener(SETTINGS_EVENT, handler)
}

export function getBgmVolume(settings = loadSettings(), base = 1) {
  return clamp01(settings.masterVolume * settings.bgmVolume * base)
}

export function getMasterVolume(settings = loadSettings(), base = 1) {
  return clamp01(settings.masterVolume * base)
}
