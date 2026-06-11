import { getBgmVolume, getMasterVolume, getSfxVolume, loadSettings, subscribeSettings } from './settings.js'

export function applyBgmVolume(audio, baseVolume = 1) {
  if (!audio) return () => {}
  const apply = (settings = loadSettings()) => {
    audio.volume = getBgmVolume(settings, baseVolume)
  }
  apply()
  return subscribeSettings(apply)
}

export function applyMasterVolume(audio, baseVolume = 1) {
  if (!audio) return () => {}
  const apply = (settings = loadSettings()) => {
    audio.volume = getMasterVolume(settings, baseVolume)
  }
  apply()
  return subscribeSettings(apply)
}

export function applySpeechVolume(utterance, baseVolume = 1) {
  if (!utterance) return
  utterance.volume = getMasterVolume(loadSettings(), baseVolume)
}

export function playSfx(name = 'click', baseVolume = 1) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) return

  const ctx = new AudioContextCtor()
  const gain = ctx.createGain()
  const osc = ctx.createOscillator()
  const volume = getSfxVolume(loadSettings(), baseVolume)
  const now = ctx.currentTime

  osc.type = name === 'roll' ? 'triangle' : 'sine'
  osc.frequency.setValueAtTime(name === 'roll' ? 180 : 520, now)
  osc.frequency.exponentialRampToValueAtTime(name === 'roll' ? 420 : 760, now + 0.08)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.18), now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.13)
  osc.onended = () => ctx.close().catch(() => {})
}
