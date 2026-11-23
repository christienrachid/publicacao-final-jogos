import { KEY_A, KEY_D, KEY_S, KEY_SPACE, KEY_SHIFT, KEY_W, Quat } from 'playcanvas';
import type { FlightContext, FlightModule, FlightState } from './types';
import type { createWorldPhysics } from './world-data';
import { TireDynamics, HATCH, COUPE } from './carphys/model';
import { extractHitboxFootprint, type HitboxFootprint } from './models/glb';

// Arcade tire grip/braking preserve the delivery game's response; this is not a road-car validation.
export const CAR_ASSISTS={tractionControl:.9,nitroGrip:1.2,lateralAcceleration:18,steeringTime:.065,yawDamping:.7,yawResponse:10,gripResponse:12,brakeBoost:3.2,uprightRoll:0};

export type GroundPhysics = ReturnType<typeof createWorldPhysics>;
export interface CarInput { drive: number; steer: number; handbrake: boolean; nitro?: boolean }
export interface CarCollider {
  x: number;
  y?: number;
  z: number;
  heading: number;
  halfWidth: number;
  halfLength: number;
  height?: number;
}
// Optional HUD bridge; keep the shared FlightState declaration unchanged.
type NitroState = FlightState & { nitro?: number };
export const getCarNitro = (state:FlightState) => (state as NitroState).nitro ?? 1;
const radians = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Teste exato 2D OBB×OBB (SAT em 4 eixos, zero alocação) para colisão carro×carro. */
export function boxesOverlap2D(
  ax: number,
  az: number,
  aHeadingDeg: number,
  aHw: number,
  aHl: number,
  bx: number,
  bz: number,
  bHeadingDeg: number,
  bHw: number,
  bHl: number,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const maxReach = aHw + aHl + bHw + bHl;
  if (dx * dx + dz * dz >= maxReach * maxReach) return false;

  const ah = aHeadingDeg * radians;
  const afx = Math.sin(ah), afz = -Math.cos(ah);
  const arx = Math.cos(ah), arz = Math.sin(ah);
  const bh = bHeadingDeg * radians;
  const bfx = Math.sin(bh), bfz = -Math.cos(bh);
  const brx = Math.cos(bh), brz = Math.sin(bh);

  const rr = Math.abs(arx * brx + arz * brz);
  const rf = Math.abs(arx * bfx + arz * bfz);
  const fr = Math.abs(afx * brx + afz * brz);
  const ff = Math.abs(afx * bfx + afz * bfz);

  if (Math.abs(dx * arx + dz * arz) >= aHw + bHw * rr + bHl * rf) return false;
  if (Math.abs(dx * afx + dz * afz) >= aHl + bHw * fr + bHl * ff) return false;
  if (Math.abs(dx * brx + dz * brz) >= bHw + aHw * rr + aHl * fr) return false;
  if (Math.abs(dx * bfx + dz * bfz) >= bHl + aHw * rf + aHl * ff) return false;
  return true;
}

export class CarDynamics {
  x = 0; y = 0; z = 0; heading = 0; speed = 0; pitch = 0; roll = 0;
  radius = 2.2;
  halfWidth = 0.88;
  halfLength = 2.2;
  height = 1.5;
  nitro=1;
  verticalSpeed=0;
  airborne=false;
  private rampSlope=0;
  readonly chassis:TireDynamics;
  constructor(
    readonly world: GroundPhysics,
    readonly tuned = false,
    private readonly extraColliders?: () => ReadonlyArray<CarCollider>,
  ) {
    this.chassis=new TireDynamics(tuned?COUPE:HATCH,CAR_ASSISTS);
  }
  get movementSpeed() { return this.chassis.speed; }
  reset(x: number, y: number, z: number, heading: number) {
    Object.assign(this, { x,y,z,heading,speed:0,pitch:0,roll:0,nitro:1,verticalSpeed:0,airborne:false,rampSlope:0 });
    this.chassis.reset(heading);
  }
  private blockedAt(x: number, z: number, y: number, headingDeg: number): boolean {
    const hw = Math.max(0.35, this.halfWidth);
    const hl = Math.max(hw, this.halfLength);
    const r = hw;
    const span = Math.max(0, hl - r);
    const h = headingDeg * radians;
    const fx = Math.sin(h), fz = -Math.cos(h);

    // Cápsula orientada (2–3 círculos de raio = meia-largura ao longo do comprimento): sem folga lateral falsa
    if (this.world.obstacleAt(x + fx * span, z + fz * span, y, r, this.height)) return true;
    if (span > 0.02 && this.world.obstacleAt(x - fx * span, z - fz * span, y, r, this.height)) return true;
    if (span > r * 0.9 && this.world.obstacleAt(x, z, y, r, this.height)) return true;

    const others = this.extraColliders?.();
    if (others && others.length > 0) {
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (o.y !== undefined && Math.abs(y - o.y) > Math.max(this.height, o.height ?? 1.5) + 0.5) continue;
        if (boxesOverlap2D(x, z, headingDeg, hw, hl, o.x, o.z, o.heading, o.halfWidth, o.halfLength)) {
          return true;
        }
      }
    }
    return false;
  }
  private moveFootprint(dx: number, dz: number): { x: number; y: number; z: number } {
    const dist = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(dist / Math.min(0.2, Math.max(0.1, this.halfWidth * 0.5))));
    let rx = this.x, ry = this.y, rz = this.z;
    const tryAxis = (axis: 'x' | 'z', delta: number) => {
      if (Math.abs(delta) < 1e-9) return;
      const nx = clamp(rx + (axis === 'x' ? delta : 0), -2980, 2980);
      const nz = clamp(rz + (axis === 'z' ? delta : 0), -2980, 2980);
      const floor = this.world.surfaceAt(nx, nz, ry + 0.35);
      const old = this.world.surfaceAt(rx, rz, ry + 0.35);
      let slopeOk = floor - old <= Math.abs(delta) * 0.55 + 0.001;
      if (!slopeOk && typeof this.world.moveCapsule === 'function') {
        const probe = this.world.moveCapsule(
          { x: rx, y: ry, z: rz },
          axis === 'x' ? delta : 0,
          axis === 'z' ? delta : 0,
          0.25,
          this.height,
          0.55,
        );
        slopeOk = Math.abs(axis === 'x' ? probe.x - nx : probe.z - nz) < 1e-4;
      }
      if (slopeOk && !this.blockedAt(nx, nz, Math.max(ry, floor), this.heading)) {
        rx = nx;
        rz = nz;
        if (ry <= old + 0.1) ry = Math.max(ry, floor);
      }
    };
    for (let i = 0; i < n; i++) {
      tryAxis('x', dx / n);
      tryAxis('z', dz / n);
    }
    return { x: rx, y: ry, z: rz };
  }
  step(input: CarInput, dt: number) {
    const drive=clamp(input.drive,-1,1), steer=clamp(input.steer,-1,1);
    const requestingNitro=this.tuned&&!!input.nitro&&drive>0;
    const boosting=requestingNitro&&this.nitro>0;
    this.nitro=clamp(this.nitro+(boosting?-.4:requestingNitro?0:.18)*dt,0,1);
    this.chassis.step({drive,steer,handbrake:input.handbrake,boost:boosting?1.65:1},dt,this.airborne,this.airborne?0:this.pitch*radians);
    this.speed=this.chassis.forwardSpeed;this.heading=((this.chassis.heading/radians)%360+360)%360;
    const h=this.heading*radians,dx=this.chassis.vx*dt,dz=this.chassis.vz*dt;
    const p=this.moveFootprint(dx,dz);
    if(Math.hypot(p.x-this.x-dx,p.z-this.z-dz)>.001) { this.chassis.stop();this.speed=0; }
    this.x=p.x;this.z=p.z;
    const floor=this.world.surfaceAt(this.x,this.z,this.y+.35),oldY=this.y;
    // todos os carros caem com gravidade ao sair de uma laje/rampa (antes só o esportivo; os outros "teletransportavam" para o chão)
    {
      if(!this.airborne&&oldY-floor>.25) {
        this.airborne=true;this.verticalSpeed=this.tuned&&this.movementSpeed>8?Math.max(2,this.movementSpeed*this.rampSlope):0;
      } else if(this.tuned&&!this.airborne&&oldY-floor>.18&&this.movementSpeed>8) {
        this.airborne=true;this.verticalSpeed=Math.max(2,this.movementSpeed*this.rampSlope);
      }
      if(this.airborne) {
        const nextY=this.y+this.verticalSpeed*dt-4.905*dt*dt;
        if(this.verticalSpeed>0&&this.blockedAt(this.x,this.z,nextY,this.heading))this.verticalSpeed=0;
        else {this.y=nextY;this.verticalSpeed-=9.81*dt;}
        if(this.verticalSpeed<=0&&this.y<=floor){this.y=floor;this.verticalSpeed=0;this.airborne=false;}
      } else {
        this.y=floor;
        if(Math.hypot(dx,dz)>.001)this.rampSlope=clamp((floor-oldY)/Math.hypot(dx,dz),0,1);
      }
    }
    const front=this.world.surfaceAt(this.x+Math.sin(h)*2,this.z-Math.cos(h)*2,this.y+.8);
    const back=this.world.surfaceAt(this.x-Math.sin(h)*2,this.z+Math.cos(h)*2,this.y+.8);
    this.pitch=clamp(Math.atan2(front-back,4)/radians,-25,25);
    if(this.airborne)this.pitch=clamp(Math.atan2(this.verticalSpeed,Math.max(1,this.movementSpeed))/radians,-25,25);
    // inclinação lateral pela rua/terreno (lado direito mais alto = roll positivo), suavizada
    if(this.airborne)this.roll=CAR_ASSISTS.uprightRoll;
    else {
      const rx=Math.cos(h)*.85,rz=Math.sin(h)*.85;
      const right=this.world.surfaceAt(this.x+rx,this.z+rz,this.y+.8),left=this.world.surfaceAt(this.x-rx,this.z-rz,this.y+.8);
      const target=clamp(Math.atan2(right-left,1.7)/radians,-20,20);
      this.roll+=(target-this.roll)*Math.min(1,dt*10);
    }
  }
}

export function publishGround(state: FlightState, body: {x:number;y:number;z:number;heading:number;speed:number;pitch:number;roll:number}, ground: number, verticalSpeed=0) {
  Object.assign(state, {x:body.x,y:body.y,z:body.z,heading:body.heading,speed:Math.abs(body.speed),pitch:body.pitch,roll:body.roll,
    verticalSpeed,altitude:body.y,heightAboveGround:Math.max(0,body.y-ground),throttle:0,stall:false,crashed:false});
}

export function createCarController(
  ctx: FlightContext,
  physics: GroundPhysics,
  extraColliders?: () => ReadonlyArray<CarCollider>,
): FlightModule {
  const {state,app,plane}=ctx, body=new CarDynamics(physics,state.vehicle==='tuned',extraColliders);
  const footprint: HitboxFootprint = { halfWidth: 0, halfLength: 0, height: 0, centerX: 0, centerZ: 0 };
  body.reset(state.x,state.y,state.z,state.heading);
  let accumulator=0, wheelAngle=0, visualSteer=0;
  const spinQuat=new Quat(), steerQuat=new Quat(), yawQ=new Quat(), pitchQ=new Quat(), rollQ=new Quat(), poseQ=new Quat();
  return { update(dt) {
    if(!Number.isFinite(dt)||dt<=0)return;
    const fp = extractHitboxFootprint(plane.hitbox, footprint);
    if (fp && fp.halfWidth > 0.3 && fp.halfLength > 0.5) {
      body.halfWidth = fp.halfWidth;
      body.halfLength = fp.halfLength;
      body.height = fp.height;
      body.radius = Math.max(fp.halfWidth, fp.halfLength);
    }
    const k=app.keyboard;
    const drive=Number(!!k?.isPressed(KEY_W))-Number(!!k?.isPressed(KEY_S));
    const steer=Number(!!k?.isPressed(KEY_D))-Number(!!k?.isPressed(KEY_A));
    accumulator+=Math.min(dt,.25);
    while(accumulator>=1/120){body.step({drive,steer,handbrake:!!k?.isPressed(KEY_SPACE),nitro:!!k?.isPressed(KEY_SHIFT)},1/120);accumulator-=1/120;}
    wheelAngle=(wheelAngle-body.speed*Math.min(dt,.25)/.35/radians)%360; // frente = -Z: rodar no sentido negativo de X faz o topo da roda ir para a frente
    // rodas da frente esterçam com o volante (menos em alta velocidade), as de trás só giram
    const steerTarget=-steer*30/(1+Math.abs(body.speed)/25);
    visualSteer+=(steerTarget-visualSteer)*Math.min(1,dt*10);
    spinQuat.setFromEulerAngles(wheelAngle,0,0);
    steerQuat.setFromEulerAngles(0,visualSteer,0).mul(spinQuat);
    for(const wheel of plane.wheels??[]){
      if(/^roda_f/i.test(wheel.name))wheel.setLocalRotation(steerQuat);else wheel.setLocalRotation(spinQuat);
    }
    publishGround(state,body,physics.surfaceAt(body.x,body.z,body.y+.35),body.verticalSpeed);
    state.speed=Math.hypot(body.movementSpeed,body.verticalSpeed);
    (state as NitroState).nitro=body.nitro;
    state.throttle=Math.max(0,drive);
    plane.root.setPosition(body.x,body.y,body.z);
    // guinada no mundo, depois arfagem e rolamento no eixo do próprio carro (acompanha subida e inclinação lateral da rua)
    yawQ.setFromEulerAngles(0,-body.heading,0);pitchQ.setFromEulerAngles(body.pitch,0,0);rollQ.setFromEulerAngles(0,0,body.roll);
    plane.root.setLocalRotation(poseQ.copy(yawQ).mul(pitchQ).mul(rollQ));
  },destroy(){delete (state as NitroState).nitro;}};
}
