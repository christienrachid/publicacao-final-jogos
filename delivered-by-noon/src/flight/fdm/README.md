<!-- Derived from JSBSim FGTable, FGStandardAtmosphere, FGAccelerations, FGPropagate and aircraft/pc7; LGPL-2.1, JSBSim-Team. -->
# A-29 flight dynamics subset, derived from PC-7

Reference: [JSBSim-Team/jsbsim](https://github.com/JSBSim-Team/jsbsim/tree/3f153c18a2518f8472e37c89e70444b1c671b700). The upstream COPYING is copied verbatim as LICENSE-JSBSim.txt. No FlightGear code is used. This is an educational subset with arcade assistance, not the complete JSBSim engine or a validated A-29 simulation.

## Aircraft data

The source PC-7 is a propeller-powered aerobatic trainer with six aerodynamic axes and a 10.40 m span. Its Aeromatic configuration explicitly describes an educational ALPHA model, not manufacturer-validated data. The source files are aircraft/pc7/pc7.xml, Systems/Conventional Controls.xml and Engines/PT6A.xml. aircraft-pc7.json retains all 13 source aerodynamic tables and 21 scalar derivatives, converted geometry, mass, inertia and engine rating. SI factors: ft=0.3048 m; lb=0.45359237 kg; slug ft^2=1.3558179483314004 kg m^2; hp=745.6998715822702 W; lbf=4.4482216152605 N.

The default aircraft-a29.json reuses those PC-7 polars with the requested 3200 kg empty / 5400 kg maximum mass, 19.4 m^2 area, 11.1 m span and 590 km/h target maximum. Reference chord is area/span; nominal flight mass is 3900 kg (3200 empty + 200 payload + 500 fuel). Estimated inertias multiply the PC-7 values by nominal mass ratio, then squared span ratio for roll, squared length ratio for pitch and the average of these squared ratios for yaw. Length is assumed to be 11.38 m. Static thrust scales with shaft power^(2/3) and propeller diameter^(2/3), using 2.39 m versus 2.2 m. The [manufacturer specifies 1600 shp](https://www.embraer.com/defense-security-air/a-29-super-tucano/en); a [USAF publication lists area, maximum mass and maximum speed](https://www.columbus.af.mil/Portals/39/SW191206.pdf). These are targets, not measured A-29 polars or inertias.

The model uses JSON dimensions directly. ASSISTS.mass=0.9 yields 3510 kg effective mass, with the same separate factor applied to inertia. PC-7 remains usable by switching the import in model.ts; its added runtime trimSpeed=70 and maximumSpeed=140 m/s are simulation settings, while stallSpeed converts the source header's 75.05 knots. No runtime aircraft selector was added. The default arcade tuning independently caps speed at 160 m/s.

## Physics and assistance

The simulated body is X forward / Y right / Z down, mapped into PlayCanvas local axes as (Y,-Z,-X); rates (p,q,r) map to quaternion axes (q,-r,-p). Body velocity is integrated independently of the nose. table.ts implements FGTable's clamped linear/bilinear lookup; atmosphere.ts implements ISA layers and geopotential conversion. model.ts uses wind-to-body forces, coefficient moments, diagonal rigid-body inertia equations and normalized quaternion increments at 120 Hz.

The subset assumes a flat nonrotating world and constant mass/inertia. It omits fuel burn, landing gear/flaps/ground effect, alpha-dot derivatives, Reynolds-dependent stall yaw initiation, propwash and engine/propeller RPM dynamics. Forces act at the CG; the source aerodynamic reference offset is retained only as metadata. Propulsion is a density-adjusted power/airspeed estimate capped by estimated static thrust. The throttle curve preserves the 60% spawn setting and increases linearly above it. Smooth additional drag above 90% of the target maximum opposes overspeed. The limited source alpha coverage is extended by a flat-plate post-stall blend.

ASSISTS groups mass, power, drag, maneuver lift, surface authority, the physical-mode input response and ceiling protection. Fixed trim is calculated for 70 m/s at reset and fades before the physical 40 m/s stall threshold. Boosted maneuver CL contributes to induced drag (CL^2). A downward moment ramps from 2300 to 2500 m before the final safety clamp.

## Arcade attitude and energy

ARCADE at the top of model.ts defaults to 1; values between 0 and 1 blend commanded rates with the aerodynamic moment/inertia integration. FlightDynamics(0) uses aerodynamic moments without the previous synthetic rate-command torque. FlightDynamics() uses the configured constant; the optional constructor value is used to test both endpoints and intermediate blends.

ARCADE_TUNING holds local roll/pitch/yaw rates of 240/90/140 degrees/s, 20 ms control/rate filters, 25 ms flight-path alignment, an extra full-power acceleration of 20 m/s^2 and a 160 m/s cap. The target path incidence comes from the source lift slope, dynamic pressure and local gravity projection. Path assistance is intentional: fast attitude changes alone would still leave the velocity lagging behind the nose and make loops heavy. The scalar speed retains the work of FDM thrust, drag and gravity (F dot v plus g dot v), without counting the body-frame Coriolis term as energy. Extra acceleration fades near the speed cap.

Default arcade stall warning starts below 25 m/s (or excessive alpha); below 35 m/s, recovery adds forward acceleration and a small nose-down rate. There is no forced minimum speed. Physical mode retains its source-based stall threshold and zero-flow loss of authority. Pitch-moment feedforward fades out with ARCADE because moments do not control the fully arcade attitude. Keyboard/no-lock and collision behavior are unchanged.

Measured by arcade.test.ts: full aileron roll 1.533 s; loop from 110 m/s at throttle 0.6 in 4.033 s with maximum speed loss 12.18% and no stall; bank-and-pull half-turn 2.442 s; right mouse aim alignment 1.375 s with 0.489 degrees overshoot. A fixed horizon aim drifts at most 0.158 m in 30 s; neutral flight drifts 2.391 m. Full throttle gains 86.11 m/s in five seconds from 70 m/s and settles at 159.12 m/s. Recovery from 20 to 30 m/s takes 1.108 s. Rotation reaches 95% and stops below 5% of maximum in 0.092 s each. These are simulation acceptance measurements, not real A-29 performance.

## Mouse guidance and collision

The instructor runs only in mouse mode with pointer lock on the application canvas. Without capture, keyboard controls remain direct: CameraRig's unlocked aim follows the nose, and feeding that target back with angle-of-attack compensation would otherwise create continuous pitch drift. With capture, keys mix in at 0.35; keyboard mode always bypasses guidance.

Horizontal guidance commands nose heading and bank; vertical guidance follows the flight path, including angle of attack. The old instruction to place the nose exactly on the horizon produced an unintended climb: the regression measured +41 m in 30 s before the fix. The corrected horizon case stays within 1 m, and an aim slightly above it produces a gentle climb. In physical mode, bounded pitch feedforward balances the existing static pitching moment only with adequate airflow and an upright attitude; it does not request +1G, use an integral or activate in stalled/inverted flight. Yaw aiming fades with bank; remaining yaw terms coordinate and damp sideslip. Bank is retained through vertical singularities. Rear targets retain a turn side and wait until upright before pulling.

The controller consumes plane.hitbox when supplied and falls back to the previous 28 local contour samples when absent/empty. Points are transformed by orientation before querying groundAt. Spawn, collision/respawn, world containment and the 250 ms frame cap remain in flight.ts.

## Verification

Run npm.cmd run typecheck, npm.cmd test, npm.cmd run build and npm.cmd run build:editor from the project root. Tests cover all arcade targets, interpolation/source data, atmosphere, reset, fixed steps, model hitbox/fallback, keyboard/mouse modes, physical-mode low-speed authority, ceiling behavior and inverted/vertical guidance. Overshoot sign changes use a 0.5 degree deadband to distinguish visible oscillation from tiny settling corrections. Flight-path elevation and nose heading are checked separately where angle of attack separates them. Browser feel and comparison with the full JSBSim remain separate checks.
