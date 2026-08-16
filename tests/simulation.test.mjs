import assert from "node:assert/strict";
import test from "node:test";

import {
  clampDetectionRadius,
  distanceBetweenLy,
  expansionArrivalGyr,
  expansionReachesTarget,
  maxDetectionRadius,
} from "../lib/simulation.mjs";

test("clamps detection radius when switching to a smaller scale", () => {
  assert.equal(maxDetectionRadius(100_000), 50_000);
  assert.equal(maxDetectionRadius(93_000_000_000), 1_000_000);
  assert.equal(clampDetectionRadius(1_000_000, 100_000), 50_000);
  assert.equal(clampDetectionRadius(1, 100_000), 10);
});

test("measures distance from Earth rather than from the view origin", () => {
  const civilization = { x: 0.5, y: 0.25, z: 0 };
  const earth = { x: 0.3, y: 0.1, z: 0 };
  assert.equal(distanceBetweenLy(civilization, earth, 10_000), 2_500);
});

test("expansion reaches Earth only before both the current time and extinction", () => {
  const arrival = expansionArrivalGyr(1_000, 5, 0.1);
  assert.equal(arrival, 5.00001);

  assert.equal(
    expansionReachesTarget({
      distanceLy: 1_000,
      expansionAtGyr: 5,
      deathGyr: 5.1,
      timeGyr: 5.00002,
      speedFractionC: 0.1,
    }),
    true,
  );
  assert.equal(
    expansionReachesTarget({
      distanceLy: 1_000,
      expansionAtGyr: 5,
      deathGyr: 5.1,
      timeGyr: 5.000005,
      speedFractionC: 0.1,
    }),
    false,
  );
  assert.equal(
    expansionReachesTarget({
      distanceLy: 1_000,
      expansionAtGyr: 5,
      deathGyr: 5.000005,
      timeGyr: 5.1,
      speedFractionC: 0.1,
    }),
    false,
  );
  assert.equal(
    expansionReachesTarget({
      distanceLy: 0,
      expansionAtGyr: 5,
      deathGyr: 6,
      timeGyr: 6,
      speedFractionC: 0,
    }),
    false,
  );
});
