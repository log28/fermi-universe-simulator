const MIN_DETECTION_RADIUS_LY = 10;
const MAX_DETECTION_RADIUS_LY = 1_000_000;
const YEARS_PER_GYR = 1_000_000_000;

export function maxDetectionRadius(diameterLy) {
  return Math.min(diameterLy / 2, MAX_DETECTION_RADIUS_LY);
}

export function clampDetectionRadius(radiusLy, diameterLy) {
  return Math.min(
    Math.max(radiusLy, MIN_DETECTION_RADIUS_LY),
    maxDetectionRadius(diameterLy),
  );
}

export function distanceBetweenLy(source, target, viewRadiusLy) {
  return (
    Math.hypot(
      source.x - target.x,
      source.y - target.y,
      source.z - target.z,
    ) * viewRadiusLy
  );
}

export function expansionArrivalGyr(
  distanceLy,
  expansionAtGyr,
  speedFractionC,
) {
  if (speedFractionC <= 0) return Number.POSITIVE_INFINITY;
  return expansionAtGyr + distanceLy / (speedFractionC * YEARS_PER_GYR);
}

export function expansionReachesTarget({
  distanceLy,
  expansionAtGyr,
  deathGyr,
  timeGyr,
  speedFractionC,
}) {
  const arrivalGyr = expansionArrivalGyr(
    distanceLy,
    expansionAtGyr,
    speedFractionC,
  );
  return arrivalGyr <= timeGyr && arrivalGyr <= deathGyr;
}
