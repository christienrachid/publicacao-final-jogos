import { KEY_C, KEY_M, KEY_V, Quat, Vec3 } from 'playcanvas';
import { isTunedNitroActive } from './hud';
import {
  type CameraMode,
  type FlightContext,
  type FlightModule,
  type FlightState,
  type VehicleKind,
} from './types';
import { consumeCameraSnap, getRuntime } from './ui/settings';

const FOV: Record<CameraMode, number> = {
  chase: 65,
  top: 60,
  cockpit: 75,
};

const VEHICLE_CAMERAS: Record<VehicleKind, readonly CameraMode[]> = {
  foot: ['chase', 'top'],
  car: ['chase', 'top'],
  tuned: ['chase', 'top'],
  a29: ['chase', 'top', 'cockpit'],
  heli: ['chase', 'top', 'cockpit'],
};

const A29_CHASE_DISTANCE = 26;
const A29_CHASE_HEIGHT = 7.2;
const A29_CHASE_OFFSET = new Vec3(0, A29_CHASE_HEIGHT, A29_CHASE_DISTANCE);
const A29_COCKPIT_OFFSET = new Vec3(0, 1.08, -1.05);

const HELI_CHASE_DISTANCE = 18;
const HELI_CHASE_HEIGHT = 5.6;
const HELI_CHASE_OFFSET = new Vec3(0, HELI_CHASE_HEIGHT, HELI_CHASE_DISTANCE);
const HELI_COCKPIT_OFFSET = new Vec3(0, 1.68, -1.65);

const CAR_CHASE_DISTANCE = 8.4;
const CAR_CHASE_HEIGHT = 2.85;
const CAR_TOP_HEIGHT = 85;

const FOOT_CHASE_DISTANCE = 3.9;
const FOOT_SHOULDER_HEIGHT = 1.56;
const FOOT_SHOULDER_RIGHT = 0.62;
const FOOT_TOP_HEIGHT = 55;

const TOP_HEIGHT = 180;
const CHASE_SMOOTH = 14;
const CAR_SMOOTH_XZ = 14;
const CAR_SMOOTH_Y = 6.5;
const CAR_ROT_SMOOTH = 12;
const CAR_LOOK_SMOOTH_XZ = 20;
const FOOT_SMOOTH = 18;
const TOP_SMOOTH = 12;
const HEAD_SMOOTH = 16;
const TELEPORT_DIST_SQ = 100 * 100;
const MOUSE_SENSITIVITY = 0.15;
const AIM_LOOK_AHEAD = 120;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

function shortestAngleDiff(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

export function createCameraRig({ app, world, plane, camera, state }: FlightContext): FlightModule {
  const planePos = new Vec3();
  const lastPlanePos = new Vec3(state.x, state.y, state.z);
  const planeRot = new Quat();
  const invPlaneRot = new Quat();
  const planeForward = new Vec3();
  const aimDir = new Vec3(0, 0, -1);
  const localAim = new Vec3();
  const lookTarget = new Vec3();
  const smoothPos = new Vec3();
  const camPos = new Vec3();
  const desiredPos = new Vec3();
  const camRot = new Quat();
  const targetRot = new Quat();
  const headRot = new Quat();
  const yawRot = new Quat();
  const pitchRot = new Quat();
  const rollRot = new Quat();
  const dir = new Vec3();
  const fallbackUp = new Vec3();
  const blendedUp = new Vec3();
  const crossTmp = new Vec3();

  let activeMode: CameraMode = state.camera;
  let activeVehicle: VehicleKind = state.vehicle;
  let activeControl: FlightState['controlMode'] = state.controlMode;
  let wasCrashed = state.crashed;
  let snapNext = true;
  let destroyed = false;
  let pendingLockRequests = 0;
  let awaitingLegacyLock = false;

  let aimYaw = state.heading;
  let aimPitch = state.pitch;
  let headYaw = 0;
  let headPitch = 0;
  let carOrbitIdle = 99;
  // Sensação ("game feel"): tremor reduzido em aeronaves, quase zero em carros, e amortecimento da suspensão
  let feelTime = 0;
  let impactShake = 0;
  let nitroShake = 0;
  let carFocusY = state.y;
  const carLookTarget = new Vec3(state.x, state.y + 1.45, state.z);
  const carSmoothRot = new Quat();
  let prevHeightAboveGround = state.heightAboveGround;
  let prevVerticalSpeed = state.verticalSpeed;
  const shakeRight = new Vec3();
  const shakeUp = new Vec3();

  const canvas = (app.graphicsDevice as { canvas?: HTMLCanvasElement } | undefined)?.canvas ?? null;

  function isAircraft(kind: VehicleKind) {
    return kind === 'a29' || kind === 'heli';
  }

  function isCar(kind: VehicleKind) {
    return kind === 'car' || kind === 'tuned';
  }

  function isMouseAimVehicle(kind: VehicleKind) {
    return kind === 'a29';
  }

  function allowsMouseLook() {
    return !isMouseAimVehicle(state.vehicle) || state.controlMode === 'mouse';
  }

  function isPointerLocked() {
    return typeof document !== 'undefined' && canvas !== null && document.pointerLockElement === canvas;
  }

  function releasePointerLock() {
    if (typeof document !== 'undefined' && document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
  }

  function detachTransitionListenersIfDone() {
    if (!destroyed) return;
    if (pendingLockRequests === 0 && !awaitingLegacyLock && !isPointerLocked()) {
      if (typeof document !== 'undefined') {
        document.removeEventListener('pointerlockchange', onPointerLockChange);
        document.removeEventListener('pointerlockerror', onPointerLockError);
      }
    }
  }

  function validatePointerLock() {
    if (destroyed || !allowsMouseLook() || getRuntime(state).mode !== 'playing') {
      releasePointerLock();
    }
  }

  function onPointerLockChange() {
    awaitingLegacyLock = false;
    validatePointerLock();
    detachTransitionListenersIfDone();
  }

  function onPointerLockError() {
    awaitingLegacyLock = false;
    detachTransitionListenersIfDone();
  }

  function onCanvasMouseDown(e: MouseEvent) {
    if (
      destroyed ||
      e.button !== 0 ||
      getRuntime(state).mode !== 'playing' ||
      !allowsMouseLook() ||
      !canvas ||
      isPointerLocked()
    ) {
      return;
    }
    const requestLock = (canvas as { requestPointerLock?: () => Promise<void> | void }).requestPointerLock;
    if (typeof requestLock !== 'function') return;
    try {
      const result = requestLock.call(canvas);
      if (result && typeof result.then === 'function') {
        pendingLockRequests++;
        result.then(
          () => {
            pendingLockRequests = Math.max(0, pendingLockRequests - 1);
            validatePointerLock();
            detachTransitionListenersIfDone();
          },
          () => {
            pendingLockRequests = Math.max(0, pendingLockRequests - 1);
            detachTransitionListenersIfDone();
          },
        );
      } else {
        awaitingLegacyLock = true;
        validatePointerLock();
      }
    } catch {
      // Ignora rejeição em ambientes sem suporte a pointer lock
    }
  }

  function onDocumentMouseMove(e: MouseEvent) {
    if (
      destroyed ||
      getRuntime(state).mode !== 'playing' ||
      !isPointerLocked() ||
      !allowsMouseLook() ||
      state.crashed
    ) {
      return;
    }
    const { mouseSensitivity, invertY } = getRuntime(state).settings;
    const sens = Number.isFinite(mouseSensitivity) ? mouseSensitivity : MOUSE_SENSITIVITY;
    const ySign = invertY ? 1 : -1;
    const pitchMin = state.vehicle === 'foot' ? -45 : isCar(state.vehicle) ? -25 : state.vehicle === 'heli' ? -40 : -85;
    const pitchMax = state.vehicle === 'foot' ? 60 : isCar(state.vehicle) ? 35 : state.vehicle === 'heli' ? 55 : 85;
    aimYaw = ((aimYaw + e.movementX * sens) % 360 + 360) % 360;
    aimPitch = clamp(aimPitch + e.movementY * sens * ySign, pitchMin, pitchMax);
    if ((isCar(state.vehicle) || state.vehicle === 'heli') && (Math.abs(e.movementX) > 0 || Math.abs(e.movementY) > 0)) {
      carOrbitIdle = 0;
    }
  }

  if (canvas) canvas.addEventListener('mousedown', onCanvasMouseDown);
  if (typeof document !== 'undefined') {
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
  }

  function readVehicleRotation(out: Quat) {
    if (state.vehicle === 'a29') {
      out.copy(plane.root.getRotation());
      return;
    }
    yawRot.setFromAxisAngle(Vec3.UP, -state.heading);
    pitchRot.setFromAxisAngle(Vec3.RIGHT, state.pitch);
    rollRot.setFromAxisAngle(Vec3.BACK, -state.roll);
    out.mul2(yawRot, pitchRot);
    out.mul(rollRot);
  }

  function syncAimToVehicleForward() {
    if (state.vehicle === 'foot' || isCar(state.vehicle) || state.vehicle === 'heli') {
      aimYaw = ((state.heading % 360) + 360) % 360;
      aimPitch = state.vehicle === 'foot' ? -6 : state.vehicle === 'heli' ? -10 : -4;
      const yawRad = aimYaw * DEG_TO_RAD;
      const pitchRad = aimPitch * DEG_TO_RAD;
      const cosPitch = Math.cos(pitchRad);
      aimDir.set(Math.sin(yawRad) * cosPitch, Math.sin(pitchRad), -Math.cos(yawRad) * cosPitch);
      return;
    }

    planeRot.transformVector(Vec3.FORWARD, planeForward);
    const len = planeForward.length();
    if (len > 0.0001) planeForward.mulScalar(1 / len);
    else planeForward.set(0, 0, -1);

    aimDir.copy(planeForward);
    aimPitch = clamp(Math.asin(clamp(planeForward.y, -1, 1)) * RAD_TO_DEG, -85, 85);
    if (Math.hypot(planeForward.x, planeForward.z) > 0.001) {
      aimYaw = (Math.atan2(planeForward.x, -planeForward.z) * RAD_TO_DEG + 360) % 360;
    }
  }

  function updateAimState(dt: number) {
    if (isCar(state.vehicle) || state.vehicle === 'heli') {
      carOrbitIdle += dt;
      // Quando o veículo segue sem mexer o mouse, a câmera realinha suavemente atrás do rumo
      const defaultPitch = state.vehicle === 'heli' ? -10 : -4;
      if (!isPointerLocked() || (carOrbitIdle > 1.5 && Math.abs(state.speed) > 1.5)) {
        const safeDt = clamp(dt, 0.001, 0.1);
        const alpha = 1 - Math.exp(-6.0 * safeDt);
        aimYaw = ((aimYaw + shortestAngleDiff(aimYaw, state.heading) * alpha) % 360 + 360) % 360;
        aimPitch += (defaultPitch - aimPitch) * alpha;
      }
      const yawRad = aimYaw * DEG_TO_RAD;
      const pitchRad = aimPitch * DEG_TO_RAD;
      const cosPitch = Math.cos(pitchRad);
      aimDir.set(Math.sin(yawRad) * cosPitch, Math.sin(pitchRad), -Math.cos(yawRad) * cosPitch);
    } else if (state.vehicle === 'foot') {
      if (!isPointerLocked()) {
        aimYaw = ((state.heading % 360) + 360) % 360;
      }
      const yawRad = aimYaw * DEG_TO_RAD;
      const pitchRad = aimPitch * DEG_TO_RAD;
      const cosPitch = Math.cos(pitchRad);
      aimDir.set(Math.sin(yawRad) * cosPitch, Math.sin(pitchRad), -Math.cos(yawRad) * cosPitch);
    } else if (state.controlMode === 'mouse' && isPointerLocked() && !state.crashed) {
      const yawRad = aimYaw * DEG_TO_RAD;
      const pitchRad = aimPitch * DEG_TO_RAD;
      const cosPitch = Math.cos(pitchRad);
      aimDir.set(Math.sin(yawRad) * cosPitch, Math.sin(pitchRad), -Math.cos(yawRad) * cosPitch);
    } else {
      syncAimToVehicleForward();
    }

    state.aimX = aimDir.x;
    state.aimY = aimDir.y;
    state.aimZ = aimDir.z;
  }

  function applyMode(mode: CameraMode) {
    const allowed = VEHICLE_CAMERAS[state.vehicle] ?? VEHICLE_CAMERAS.a29;
    const resolved: CameraMode = allowed.includes(mode) ? mode : allowed[0];
    activeMode = resolved;
    state.camera = resolved;
    if (camera.camera) camera.camera.fov = FOV[resolved];
    const showExterior = resolved !== 'cockpit' || !isAircraft(state.vehicle);
    for (let i = 0; i < plane.exterior.length; i++) {
      const render = plane.exterior[i].render;
      if (render) render.enabled = showExterior;
      const modelComp = plane.exterior[i].model;
      if (modelComp) modelComp.enabled = showExterior;
    }
  }

  function computeHeadingUp(headingDeg: number, out: Vec3) {
    const rad = headingDeg * DEG_TO_RAD;
    out.set(Math.sin(rad), 0, -Math.cos(rad));
    return out;
  }

  function safeLookAt(target: Vec3, headingDeg: number) {
    dir.sub2(target, camera.getPosition());
    const len = dir.length();
    if (len < 0.01) return;
    dir.mulScalar(1 / len);

    const absY = Math.abs(dir.y);
    if (absY <= 0.94) {
      camera.lookAt(target, Vec3.UP);
      return;
    }

    // Preserva continuidade do vetor superior perto da vertical (evita inversão 180°)
    const t = clamp((absY - 0.94) / 0.05, 0, 1);
    computeHeadingUp(headingDeg, fallbackUp);
    if (dir.y > 0) fallbackUp.mulScalar(-1);

    blendedUp.set(fallbackUp.x * t, 1 - t, fallbackUp.z * t);
    crossTmp.cross(dir, blendedUp);
    if (crossTmp.lengthSq() < 1e-6) {
      const rad = headingDeg * DEG_TO_RAD;
      blendedUp.set(Math.cos(rad), 0, Math.sin(rad));
    } else {
      blendedUp.normalize();
    }
    camera.lookAt(target, blendedUp);
  }

  function surfaceFloorAt(x: number, z: number, ceiling: number): number {
    return world.surfaceAt ? world.surfaceAt(x, z, ceiling) : world.groundAt(x, z);
  }

  function updateFootChase(dt: number, snap: boolean) {
    // Terceira pessoa por cima do ombro direito; mouse gira a câmera livremente
    const yawRad = aimYaw * DEG_TO_RAD;
    const rightX = Math.cos(yawRad);
    const rightZ = Math.sin(yawRad);
    const anchorX = planePos.x + rightX * FOOT_SHOULDER_RIGHT;
    const anchorY = planePos.y + FOOT_SHOULDER_HEIGHT;
    const anchorZ = planePos.z + rightZ * FOOT_SHOULDER_RIGHT;

    desiredPos.set(
      anchorX - aimDir.x * FOOT_CHASE_DISTANCE,
      anchorY - aimDir.y * FOOT_CHASE_DISTANCE,
      anchorZ - aimDir.z * FOOT_CHASE_DISTANCE,
    );
    const ceiling = Math.max(planePos.y + 2.2, desiredPos.y + 0.6);
    const minGroundY = surfaceFloorAt(desiredPos.x, desiredPos.z, ceiling) + 0.55;
    if (desiredPos.y < minGroundY) desiredPos.y = minGroundY;

    if (snap) {
      smoothPos.copy(desiredPos);
    } else {
      const safeDt = clamp(dt, 0, 0.1);
      const alpha = 1 - Math.exp(-FOOT_SMOOTH * safeDt);
      smoothPos.lerp(smoothPos, desiredPos, alpha);
      const minCamY = surfaceFloorAt(smoothPos.x, smoothPos.z, Math.max(planePos.y + 2.2, smoothPos.y + 0.6)) + 0.55;
      if (smoothPos.y < minCamY) smoothPos.y = minCamY;
    }
    camera.setPosition(smoothPos);
    lookTarget.set(anchorX + aimDir.x * 35, anchorY + aimDir.y * 35, anchorZ + aimDir.z * 35);
    safeLookAt(lookTarget, aimYaw);
  }

  function updateCarChase(dt: number, snap: boolean) {
    // Chase automotiva estável: amortecimento vertical e rotação suavizada para não repassar vibração da suspensão
    const safeDt = clamp(dt, 0, 0.1);
    const yawRad = aimYaw * DEG_TO_RAD;
    const pitchRad = aimPitch * DEG_TO_RAD;
    const backX = -Math.sin(yawRad) * Math.cos(pitchRad);
    const backZ = Math.cos(yawRad) * Math.cos(pitchRad);

    if (snap) {
      carFocusY = planePos.y;
      carLookTarget.set(planePos.x, carFocusY + 1.45, planePos.z);
    } else {
      const alphaFocusY = 1 - Math.exp(-CAR_SMOOTH_Y * safeDt);
      carFocusY += (planePos.y - carFocusY) * alphaFocusY;
      // Limita defasagem vertical em rampas íngremes sem deixar passar trepidação de malha
      carFocusY = clamp(carFocusY, planePos.y - 0.45, planePos.y + 0.45);
      const alphaLookXZ = 1 - Math.exp(-CAR_LOOK_SMOOTH_XZ * safeDt);
      carLookTarget.x += (planePos.x - carLookTarget.x) * alphaLookXZ;
      carLookTarget.z += (planePos.z - carLookTarget.z) * alphaLookXZ;
      carLookTarget.y = carFocusY + 1.45;
    }

    desiredPos.set(
      planePos.x + backX * CAR_CHASE_DISTANCE,
      carFocusY + CAR_CHASE_HEIGHT - Math.sin(pitchRad) * CAR_CHASE_DISTANCE * 0.55,
      planePos.z + backZ * CAR_CHASE_DISTANCE,
    );
    const ceiling = Math.max(planePos.y + 3.5, desiredPos.y + 0.8);
    const minGroundY = surfaceFloorAt(desiredPos.x, desiredPos.z, ceiling) + 0.9;
    if (desiredPos.y < minGroundY) desiredPos.y = minGroundY;

    if (snap) {
      smoothPos.copy(desiredPos);
    } else {
      const alphaXZ = 1 - Math.exp(-CAR_SMOOTH_XZ * safeDt);
      const alphaY = 1 - Math.exp(-CAR_SMOOTH_Y * safeDt);
      smoothPos.x += (desiredPos.x - smoothPos.x) * alphaXZ;
      smoothPos.z += (desiredPos.z - smoothPos.z) * alphaXZ;
      smoothPos.y += (desiredPos.y - smoothPos.y) * alphaY;
      const minCamY = surfaceFloorAt(smoothPos.x, smoothPos.z, Math.max(planePos.y + 3.5, smoothPos.y + 0.8)) + 0.9;
      if (smoothPos.y < minCamY) smoothPos.y = minCamY;
    }
    camera.setPosition(smoothPos);
    safeLookAt(carLookTarget, aimYaw);
    if (snap) {
      carSmoothRot.copy(camera.getRotation());
    } else {
      targetRot.copy(camera.getRotation());
      const alphaRot = 1 - Math.exp(-CAR_ROT_SMOOTH * safeDt);
      carSmoothRot.slerp(carSmoothRot, targetRot, alphaRot);
      camera.setRotation(carSmoothRot);
    }

    if (camera.camera) {
      const reduceMotion = getRuntime(state).settings.reduceMotion;
      const nitroOn = isTunedNitroActive(state);
      const speedAbs = Math.abs(state.speed);
      const maxAdd = reduceMotion ? 1.5 : state.vehicle === 'tuned' ? 6.5 : 4.0;
      const baseAdd =
        state.vehicle === 'tuned'
          ? clamp((speedAbs - 18) / 42, 0, 1) * 4.2 + (nitroOn ? 2.3 : 0)
          : clamp((speedAbs - 16) / 34, 0, 1) * 4.0;
      const targetFov = FOV.chase + Math.min(maxAdd, baseAdd);
      camera.camera.fov = snap ? targetFov : camera.camera.fov + (targetFov - camera.camera.fov) * (1 - Math.exp(-3.6 * safeDt));
    }
  }

  function updateAircraftChase(dt: number, snap: boolean) {
    const safeDt = clamp(dt, 0, 0.1);
    const isHeli = state.vehicle === 'heli';
    const chaseDist = isHeli ? HELI_CHASE_DISTANCE : A29_CHASE_DISTANCE;
    const chaseHeight = isHeli ? HELI_CHASE_HEIGHT : A29_CHASE_HEIGHT;
    const chaseOffset = isHeli ? HELI_CHASE_OFFSET : A29_CHASE_OFFSET;

    const useMouseAim = isMouseAimVehicle(state.vehicle) && state.controlMode === 'mouse';
    if (isHeli) {
      // No helicóptero, o mouse apenas gira a câmera ao redor (sem mira de voo)
      const yawRad = aimYaw * DEG_TO_RAD;
      const pitchRad = aimPitch * DEG_TO_RAD;
      const cosP = Math.cos(pitchRad);
      desiredPos.set(
        planePos.x - Math.sin(yawRad) * cosP * chaseDist,
        planePos.y + chaseHeight - Math.sin(pitchRad) * chaseDist * 0.65,
        planePos.z + Math.cos(yawRad) * cosP * chaseDist,
      );
      lookTarget.set(planePos.x, planePos.y + 1.4, planePos.z);
    } else if (useMouseAim) {
      desiredPos.copy(aimDir).mulScalar(-chaseDist).add(planePos);
      desiredPos.y += chaseHeight;
      lookTarget.copy(aimDir).mulScalar(AIM_LOOK_AHEAD).add(planePos);
    } else {
      planeRot.transformVector(chaseOffset, desiredPos).add(planePos);
      lookTarget.copy(planePos);
    }

    const ceiling = Math.max(planePos.y + 4.5, desiredPos.y + 1.0);
    const minGroundY = surfaceFloorAt(desiredPos.x, desiredPos.z, ceiling) + 2.2;
    if (desiredPos.y < minGroundY) desiredPos.y = minGroundY;

    if (snap) {
      smoothPos.copy(desiredPos);
    } else {
      const alpha = 1 - Math.exp(-CHASE_SMOOTH * safeDt);
      smoothPos.lerp(smoothPos, desiredPos, alpha);
      const minCamY = surfaceFloorAt(smoothPos.x, smoothPos.z, Math.max(planePos.y + 4.5, smoothPos.y + 1.0)) + 2.2;
      if (smoothPos.y < minCamY) smoothPos.y = minCamY;
    }
    camera.setPosition(smoothPos);
    safeLookAt(lookTarget, isHeli || useMouseAim ? aimYaw : state.heading);
    if (camera.camera) {
      const reduceMotion = getRuntime(state).settings.reduceMotion;
      const speedNorm = isHeli
        ? clamp((Math.abs(state.speed) - 12) / 42, 0, 1)
        : clamp((Math.abs(state.speed) - 45) / 100, 0, 1);
      const targetFov = FOV.chase + speedNorm * (reduceMotion ? 2.0 : isHeli ? 4.0 : 7.0);
      camera.camera.fov = snap ? targetFov : camera.camera.fov + (targetFov - camera.camera.fov) * (1 - Math.exp(-4.2 * safeDt));
    }
  }

  function updateChase(dt: number, snap: boolean) {
    if (state.vehicle === 'foot') {
      updateFootChase(dt, snap);
    } else if (isCar(state.vehicle)) {
      updateCarChase(dt, snap);
    } else {
      updateAircraftChase(dt, snap);
    }
  }

  function updateTop(dt: number, snap: boolean) {
    const safeDt = clamp(dt, 0, 0.1);
    const topHeight =
      state.vehicle === 'foot' ? FOOT_TOP_HEIGHT : isCar(state.vehicle) ? CAR_TOP_HEIGHT : TOP_HEIGHT;
    desiredPos.set(planePos.x, planePos.y + topHeight, planePos.z);
    yawRot.setFromAxisAngle(Vec3.UP, -state.heading);
    pitchRot.setFromAxisAngle(Vec3.RIGHT, -90);
    targetRot.mul2(yawRot, pitchRot);

    if (snap) {
      smoothPos.copy(desiredPos);
      camRot.copy(targetRot);
    } else {
      const alpha = 1 - Math.exp(-TOP_SMOOTH * safeDt);
      smoothPos.lerp(smoothPos, desiredPos, alpha);
      camRot.copy(camera.getRotation()).slerp(camRot, targetRot, alpha);
    }
    camera.setPosition(smoothPos);
    camera.setRotation(camRot);
  }

  function updateCockpit(dt: number, snap: boolean) {
    const safeDt = clamp(dt, 0, 0.1);
    const offset = state.vehicle === 'heli' ? HELI_COCKPIT_OFFSET : A29_COCKPIT_OFFSET;
    planeRot.transformVector(offset, desiredPos).add(planePos);
    smoothPos.copy(desiredPos);
    camera.setPosition(smoothPos);

    let targetHeadYaw = 0;
    let targetHeadPitch = 0;
    if (allowsMouseLook() && isPointerLocked()) {
      invPlaneRot.copy(planeRot).invert();
      invPlaneRot.transformVector(aimDir, localAim);
      // Usa asin(localAim.x) para evitar o salto ±180° do atan2 quando a mira cruza atrás da cauda
      const relYaw = Math.asin(clamp(localAim.x, -1, 1)) * RAD_TO_DEG;
      const relPitch = Math.asin(clamp(localAim.y, -1, 1)) * RAD_TO_DEG;
      targetHeadYaw = clamp(relYaw * 0.45, -26, 26);
      targetHeadPitch = clamp(relPitch * 0.45, -18, 18);
    }

    if (snap) {
      headYaw = targetHeadYaw;
      headPitch = targetHeadPitch;
    } else {
      const alpha = 1 - Math.exp(-HEAD_SMOOTH * safeDt);
      headYaw += (targetHeadYaw - headYaw) * alpha;
      headPitch += (targetHeadPitch - headPitch) * alpha;
    }

    if (Math.abs(headYaw) > 0.01 || Math.abs(headPitch) > 0.01) {
      yawRot.setFromAxisAngle(Vec3.UP, -headYaw);
      pitchRot.setFromAxisAngle(Vec3.RIGHT, headPitch);
      headRot.mul2(yawRot, pitchRot);
      targetRot.mul2(planeRot, headRot);
      camera.setRotation(targetRot);
    } else {
      camera.setRotation(planeRot);
    }
  }

  function applyCameraShake(dt: number) {
    const reduceMotion = getRuntime(state).settings.reduceMotion;
    if (reduceMotion) {
      impactShake = 0;
      nitroShake = 0;
      return;
    }

    const safeDt = clamp(dt, 0, 0.1);
    feelTime = (feelTime + safeDt) % 1000;
    impactShake *= Math.exp(-8.5 * safeDt);
    if (impactShake < 0.004) impactShake = 0;

    // Veículos de chão (carro, tunado, a pé): sem sacudida por velocidade ou nitro; impacto quase zero
    const isGround = isCar(state.vehicle) || state.vehicle === 'foot';
    if (isGround) {
      nitroShake = 0;
      const groundAmp = Math.min(0.012, impactShake * 0.012);
      if (groundAmp <= 0.0005) return;
      const sx = Math.sin(feelTime * 9.5) * groundAmp;
      const sy = Math.cos(feelTime * 11.2) * groundAmp * 0.65;
      camRot.copy(camera.getRotation());
      camRot.transformVector(Vec3.RIGHT, shakeRight);
      camRot.transformVector(Vec3.UP, shakeUp);
      camPos.set(
        smoothPos.x + shakeRight.x * sx + shakeUp.x * sy,
        smoothPos.y + shakeRight.y * sx + shakeUp.y * sy,
        smoothPos.z + shakeRight.z * sx + shakeUp.z * sy,
      );
      camera.setPosition(camPos);
      return;
    }

    nitroShake = 0;
    const amp = Math.min(0.22, impactShake * 0.22);
    if (amp <= 0.001) return;

    const freqScale = impactShake > 0.05 ? 1.25 : 1.0;
    const sx = (Math.sin(feelTime * 11.5 * freqScale) * 0.65 + Math.cos(feelTime * 16.2 * freqScale) * 0.35) * amp;
    const sy = (Math.cos(feelTime * 13.7 * freqScale) * 0.7 + Math.sin(feelTime * 18.4 * freqScale) * 0.3) * amp * 0.72;
    camRot.copy(camera.getRotation());
    camRot.transformVector(Vec3.RIGHT, shakeRight);
    camRot.transformVector(Vec3.UP, shakeUp);
    camPos.set(
      smoothPos.x + shakeRight.x * sx + shakeUp.x * sy,
      smoothPos.y + shakeRight.y * sx + shakeUp.y * sy,
      smoothPos.z + shakeRight.z * sx + shakeUp.z * sy,
    );
    camera.setPosition(camPos);
  }

  function applyActiveMode(dt: number, snap: boolean) {
    if (activeMode === 'cockpit' && isAircraft(state.vehicle)) {
      updateCockpit(dt, snap);
    } else if (activeMode === 'top') {
      updateTop(dt, snap);
    } else {
      updateChase(dt, snap);
    }
    if (!snap) applyCameraShake(dt);
  }

  // Inicializa câmera, mira, FOV e visibilidade externa no quadro zero.
  applyMode(state.camera);
  planePos.set(state.x, state.y, state.z);
  readVehicleRotation(planeRot);
  syncAimToVehicleForward();
  updateAimState(0);
  applyActiveMode(0, true);
  snapNext = false;

  return {
    update(dt: number) {
      if (destroyed) return;

      let modeSwitched = false;
      const keyboard = app.keyboard;

      // Detecta troca de veículo (entrar/sair de carro, helicóptero, A-29 ou a pé)
      if (state.vehicle !== activeVehicle) {
        activeVehicle = state.vehicle;
        applyMode(state.camera);
        planePos.set(state.x, state.y, state.z);
        readVehicleRotation(planeRot);
        syncAimToVehicleForward();
        headYaw = 0;
        headPitch = 0;
        carOrbitIdle = 99;
        snapNext = true;
        modeSwitched = true;
      }

      if (keyboard?.wasPressed(KEY_C) || keyboard?.wasPressed(KEY_V)) {
        const order = VEHICLE_CAMERAS[state.vehicle] ?? VEHICLE_CAMERAS.a29;
        const idx = order.indexOf(state.camera);
        const nextMode = order[(idx + 1) % order.length];
        applyMode(nextMode);
        snapNext = true;
        modeSwitched = true;
      } else if (state.camera !== activeMode) {
        applyMode(state.camera);
        snapNext = true;
        modeSwitched = true;
      }

      if (consumeCameraSnap(state)) {
        applyMode(state.camera);
        planePos.set(state.x, state.y, state.z);
        readVehicleRotation(planeRot);
        syncAimToVehicleForward();
        headYaw = 0;
        headPitch = 0;
        carOrbitIdle = 99;
        snapNext = true;
        modeSwitched = true;
      }

      if (isMouseAimVehicle(state.vehicle) && keyboard?.wasPressed(KEY_M)) {
        state.controlMode = state.controlMode === 'mouse' ? 'keyboard' : 'mouse';
      }
      if (state.controlMode !== activeControl) {
        activeControl = state.controlMode;
        if (!allowsMouseLook()) {
          releasePointerLock();
        } else {
          readVehicleRotation(planeRot);
          syncAimToVehicleForward();
        }
      } else if (!allowsMouseLook() && isPointerLocked()) {
        releasePointerLock();
      }

      planePos.set(state.x, state.y, state.z);
      readVehicleRotation(planeRot);

      if (state.crashed) {
        if (!wasCrashed) {
          wasCrashed = true;
          impactShake = 1.0;
        }
        updateAimState(dt);
        if (modeSwitched) {
          applyActiveMode(dt, true);
        } else if (activeMode !== 'cockpit') {
          safeLookAt(planePos, state.heading);
          applyCameraShake(dt);
        }
        snapNext = false;
        lastPlanePos.copy(planePos);
        prevHeightAboveGround = state.heightAboveGround;
        prevVerticalSpeed = state.verticalSpeed;
        return;
      }

      // Detecta pouso forte do helicóptero ou A-29 para tremor curto
      if (
        isAircraft(state.vehicle) &&
        prevHeightAboveGround > 0.75 &&
        state.heightAboveGround <= 0.45 &&
        prevVerticalSpeed < -2.4
      ) {
        impactShake = Math.max(impactShake, clamp((-prevVerticalSpeed - 2.0) / 7.5, 0.25, 0.92));
      }

      if (wasCrashed) {
        wasCrashed = false;
        snapNext = true;
        syncAimToVehicleForward();
      } else if (lastPlanePos.distanceSq(planePos) > TELEPORT_DIST_SQ) {
        snapNext = true;
        syncAimToVehicleForward();
      }
      lastPlanePos.copy(planePos);

      updateAimState(dt);
      applyActiveMode(dt, snapNext);
      snapNext = false;
      prevHeightAboveGround = state.heightAboveGround;
      prevVerticalSpeed = state.verticalSpeed;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (canvas) canvas.removeEventListener('mousedown', onCanvasMouseDown);
      if (typeof document !== 'undefined') {
        document.removeEventListener('mousemove', onDocumentMouseMove);
      }
      releasePointerLock();
      detachTransitionListenersIfDone();
      for (let i = 0; i < plane.exterior.length; i++) {
        const render = plane.exterior[i].render;
        if (render) render.enabled = true;
        const modelComp = plane.exterior[i].model;
        if (modelComp) modelComp.enabled = true;
      }
    },
  };
}
