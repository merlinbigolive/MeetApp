function selectActiveVideo(visibilityById, minimumVisibleRatio = 0.25) {
  if (!visibilityById || typeof visibilityById !== 'object') return null;
  let activeId = null;
  let highestRatio = minimumVisibleRatio;
  for (const [id, rawRatio] of Object.entries(visibilityById)) {
    const ratio = Number(rawRatio);
    if (!id || !Number.isFinite(ratio) || ratio < minimumVisibleRatio || ratio > 1) continue;
    if (activeId === null || ratio > highestRatio) {
      activeId = id;
      highestRatio = ratio;
    }
  }
  return activeId;
}

module.exports = { selectActiveVideo };
