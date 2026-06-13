import { getBgmVolume, getMasterVolume, loadSettings, subscribeSettings } from './settings.js'

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
