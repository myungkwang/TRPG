export function shouldBlockForBackground({
  location,
  fixedBackgroundReady,
  generatedBackgrounds,
  triedLocations,
  isLoading,
}) {
  if (isLoading) return true
  if (!location || fixedBackgroundReady) return false
  if (generatedBackgrounds?.[location]) return false
  return !triedLocations?.has(location)
}

