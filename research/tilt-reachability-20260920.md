# Device-input reachability verification — 2026-09-20

The earlier local-gravity cone test did not by itself prove that the sensor axes and camera transform could produce those directions. `tests/tilt-reachability.test.ts` closes that gap with actual `TiltInput.update`, `Scene.updateCamera`, `Scene.rotate`, `Physics.step`, and goal/checkpoint progression.

The simulation supplies synthetic orientation events at 60 Hz and advances the existing physics at 120 Hz. A bounded feedback controller selects an input from a 2-degree grid. Both beta and gamma remain within 28 degrees of the initial reading, and the physical gravity-vector change remains within 28 degrees. The production input dead zone, smoothing, angular speed limit, and absolute offset are retained. There is no drag, recalibration, teleport, extra force, physics override, or checkpoint reset during a run. Screen orientation is portrait (0 degrees), initial gamma is 0.

| Stage | Initial beta | Finish time, simulated seconds | Largest maze offset | Largest movement per physics step | Largest floor-normal error |
|---|---:|---:|---:|---:|---:|
| 01 | 45° | 12.94 | 24.78° | 0.02826 | 0.002571 |
| 02 | 45° | 25.57 | 24.30° | 0.02377 | 0.001524 |
| 03 | 30° | 43.09 | 25.61° | 0.02365 | 0.000915 |
| 03 | 45° | 43.17 | 21.17° | 0.02416 | 0.000915 |
| 03 | 60° | 43.61 | 20.32° | 0.02366 | 0.000907 |

Every run passes every checkpoint, reaches the goal, and satisfies the existing goal condition (speed below 0.55 for at least 0.65 seconds). Maximum speed stays within the existing 2.6 cap plus floating-point tolerance. Floor-normal error stays below the existing attachment regression tolerance of 0.003. Sampled reachable commands include a strictly positive forward gravity component at every route tangent for all five cases.

Run: `npm test -- --run tests/tilt-reachability.test.ts --reporter=verbose --silent=false` (5 tests).

These are constructive software-level reachability checks, not human completion times or iPhone sensor, permission, latency, and comfort measurements. Landscape posture and extreme initial holding angles are not covered by this route simulation. They do not establish that every arbitrary pose or every direction is reachable within the limit.
