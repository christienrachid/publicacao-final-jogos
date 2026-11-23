// Integration of JSBSim-derived fdm/model.ts (FGPropagate/FGAccelerations); LGPL-2.1, JSBSim-Team.
import {
  KEY_A, KEY_CONTROL, KEY_D, KEY_DOWN, KEY_E, KEY_LEFT, KEY_Q, KEY_R,
  KEY_RIGHT, KEY_S, KEY_SHIFT, KEY_UP, KEY_W, Quat, Vec3, type Entity,
} from 'playcanvas';
import type { FlightContext, FlightModule, VehicleSpawn } from './types';
import { SPAWN } from './types';
import { FIXED_STEP, FlightDynamics, type FlightControls } from './fdm/model';
import { INSTRUCTOR, MouseInstructor } from './fdm/instructor';
import { AircraftGround } from './fdm/ground';
import { HeliDynamics, type HeliControls } from './fdm/heli';

type FlightSpawn = VehicleSpawn & { speed?:number };

export function createFlightController(ctx: FlightContext, spawn?: FlightSpawn, resetSpawn:VehicleSpawn|undefined = spawn): FlightModule {
  const start = spawn ? { ...spawn } : undefined;
  const home = resetSpawn ? { ...resetSpawn } : undefined;
  return (start?.kind ?? ctx.state.vehicle) === 'heli' ? createHeliController(ctx, start, home) : createA29Controller(ctx, start, home);
}

function createA29Controller({ app, world, plane, state }: FlightContext, spawn?: FlightSpawn, home:VehicleSpawn|undefined = spawn): FlightModule {
  const fdm = new FlightDynamics();
  const instructor = new MouseInstructor();
  const rotation = fdm.rotation;
  const turn = new Quat();
  const inverse = new Quat();
  const forward = new Vec3();
  const right = new Vec3();
  const up = new Vec3();
  const collisionPoint = new Vec3();
  const velocity = new Vec3();
  const input: FlightControls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6 };
  // Extremos do modelo em airplane.ts, incluindo as duas faces para voo invertido.
  const modelHitbox = plane.hitbox;
  const collisionPoints = (modelHitbox?.length ? modelHitbox : [
    [-5, -0.54, -1.41], [-5, -0.54, 0.21], [5, -0.54, -1.41], [5, -0.54, 0.21],
    [-5, -0.36, -1.41], [-5, -0.36, 0.21], [5, -0.36, -1.41], [5, -0.36, 0.21],
    [0, -1.15, -3.325], [0, 1.05, -3.325], [-1.1, -0.05, -3.325], [1.1, -0.05, -3.325],
    [-1.8, 0.14, 4.35], [1.8, 0.14, 4.35], [-1.8, 0.26, 4.35], [1.8, 0.26, 4.35],
    [-0.06, 1.7, 3.45], [0.06, 1.7, 3.45], [-0.06, 1.7, 4.45], [0.06, 1.7, 4.45],
    [0, -0.325, 4.3], [-1.2, -1.65, -0.7], [1.2, -1.65, -0.7], [0, -1.55, -2.5],
    [-0.575, -0.625, -2.5], [0.575, -0.625, -2.5],
    [-0.475, 1.025, -1.45], [0.475, 1.025, -1.45],
  ]).map(([x, y, z]) => new Vec3(x, y, z));
  const clearance = Math.max(.1, ...collisionPoints.map(p => -p.y));
  const support = (x:number,z:number) => world.surfaceAt?.(x,z,fdm.position.y+.35) ?? world.groundAt(x,z);
  const ground = new AircraftGround(support, clearance, world.isRunway);
  const degrees = 180 / Math.PI;
  let crashTime = 0;
  let propAngle = 0;
  let returnDirection = 0;
  let accumulator = 0;
  let resetPoint:FlightSpawn|undefined = spawn;

  function attitude() {
    rotation.transformVector(Vec3.FORWARD, forward);
    rotation.transformVector(Vec3.RIGHT, right);
    rotation.transformVector(Vec3.UP, up);
    state.pitch = Math.asin(Math.max(-1, Math.min(1, forward.y))) * degrees;
    if (Math.hypot(right.y, up.y) > 0.001) state.roll = Math.atan2(-right.y, up.y) * degrees;
    if (Math.hypot(forward.x, forward.z) > 0.001) {
      state.heading = (Math.atan2(forward.x, -forward.z) * degrees + 360) % 360;
    }
  }

  function publish() {
    attitude();
    state.x = fdm.position.x;
    state.y = fdm.position.y;
    state.z = fdm.position.z;
    state.speed = state.crashed ? 0 : fdm.speed;
    state.verticalSpeed = state.crashed ? 0 : fdm.worldVelocity.y;
    state.altitude = state.y;
    state.heightAboveGround = Math.max(0,state.y - support(state.x, state.z));
    state.throttle = fdm.controls.throttle;
    state.stall = !state.crashed && fdm.stalled;
    plane.root.setPosition(fdm.position);
    plane.root.setRotation(rotation);
  }

  function reset() {
    const start = resetPoint ?? SPAWN;
    resetPoint = home;
    const flying = !spawn || ('speed' in start && (start.speed ?? 0) > 0);
    fdm.reset(start.x, start.y, start.z, start.heading, flying ? ('speed' in start ? start.speed! : SPAWN.speed) : .1, flying ? .6 : 0);
    ground.crashed = false; ground.grounded = false; ground.takeoffAssist = 0;
    if (!flying) ground.park(fdm, start.heading);
    instructor.reset(start.heading);
    input.pitch = input.roll = input.yaw = 0;
    input.throttle = flying ? .6 : 0;
    state.crashed = false;
    crashTime = propAngle = returnDirection = accumulator = 0;
    plane.prop.setLocalEulerAngles(0, 0, 0);
    plane.root.enabled = true;
    publish();
  }

  function containWorld() {
    const pos = fdm.position;
    if (Math.abs(pos.x) > 2500 || Math.abs(pos.z) > 2500) {
      attitude();
      const target = Math.atan2(-pos.x, pos.z) * degrees;
      let error = ((target - state.heading + 540) % 360) - 180;
      if (Math.abs(error) > 170 && returnDirection) error = Math.abs(error) * returnDirection;
      returnDirection = Math.sign(error);
      const strength = Math.min(1, (Math.max(Math.abs(pos.x), Math.abs(pos.z)) - 2500) / 400);
      turn.setFromAxisAngle(Vec3.UP, -Math.max(-75, Math.min(75, error * 1.5)) * strength * FIXED_STEP);
      rotation.mul2(turn, rotation).normalize();
    } else {
      returnDirection = 0;
    }
    pos.x = Math.max(-2980, Math.min(2980, pos.x));
    pos.z = Math.max(-2980, Math.min(2980, pos.z));
    velocity.set(fdm.velocity.y, -fdm.velocity.z, -fdm.velocity.x);
    rotation.transformVector(velocity, fdm.worldVelocity);
    if (pos.y > 2500) {
      pos.y = 2500;
      fdm.worldVelocity.y = Math.min(0, fdm.worldVelocity.y);
      inverse.copy(rotation).invert().transformVector(fdm.worldVelocity, velocity);
      fdm.velocity.set(-velocity.z, velocity.x, -velocity.y);
    }
  }

  reset();
  return {
    update(dt) {
      if (app.keyboard?.wasPressed(KEY_R)) { reset(); return; }
      if (!Number.isFinite(dt) || dt <= 0) return;
      if (plane.hitbox?.length) {
        collisionPoints.length = plane.hitbox.length;
        plane.hitbox.forEach(([x,y,z],i) => (collisionPoints[i] ??= new Vec3()).set(x,y,z));
        ground.clearance = Math.max(.1,...collisionPoints.map(p => -p.y));
        if (ground.grounded) fdm.position.y = support(fdm.position.x,fdm.position.z) + ground.clearance;
      }
      const duration = Math.min(dt, 0.25);
      if (state.crashed) {
        crashTime += duration;
        if (crashTime >= 2) reset();
        else publish();
        return;
      }
      const keyboard = app.keyboard;
      const pitchInput = Number(!!(keyboard?.isPressed(KEY_S) || keyboard?.isPressed(KEY_DOWN)))
        - Number(!!(keyboard?.isPressed(KEY_W) || keyboard?.isPressed(KEY_UP)));
      const rollInput = Number(!!(keyboard?.isPressed(KEY_D) || keyboard?.isPressed(KEY_RIGHT)))
        - Number(!!(keyboard?.isPressed(KEY_A) || keyboard?.isPressed(KEY_LEFT)));
      const yawInput = Number(!!keyboard?.isPressed(KEY_E)) - Number(!!keyboard?.isPressed(KEY_Q));
      const canvas = app.graphicsDevice?.canvas;
      const pointerLocked = !!canvas && typeof document !== 'undefined' && document.pointerLockElement === canvas;
      const throttleInput = Number(!!keyboard?.isPressed(KEY_SHIFT)) - Number(!!keyboard?.isPressed(KEY_CONTROL));
      input.throttle = Math.max(0, Math.min(1, input.throttle + throttleInput * 0.5 * duration));
      accumulator += duration;
      while (accumulator >= FIXED_STEP) {
        accumulator -= FIXED_STEP;
        if (state.controlMode === 'mouse' && pointerLocked) {
          instructor.steer(fdm, state.aimX, state.aimY, state.aimZ, input);
          input.pitch = Math.max(-1, Math.min(1, input.pitch + pitchInput * INSTRUCTOR.manualTrim));
          input.roll = Math.max(-1, Math.min(1, input.roll + rollInput * INSTRUCTOR.manualTrim));
          input.yaw = Math.max(-1, Math.min(1, input.yaw + yawInput * INSTRUCTOR.manualTrim));
        } else {
          input.pitch = pitchInput;
          input.roll = rollInput;
          input.yaw = yawInput;
        }
        const onWheels = ground.step(fdm, input, !!keyboard?.isPressed(KEY_CONTROL) && input.throttle === 0);
        if (!onWheels) {
          if (ground.takeoffAssist > 0) input.pitch = .05;
          fdm.step(input);
        }
        containWorld();
        if (ground.crashed) { state.crashed = true; plane.root.enabled = false; accumulator = 0; break; }
        let contactHeight: number | undefined;
        for (const point of collisionPoints) {
          rotation.transformVector(point, collisionPoint).add(fdm.position);
          const obstacle = world.obstacleAt?.(collisionPoint.x,collisionPoint.z,collisionPoint.y,0,.01);
          const height = obstacle?.top ?? world.surfaceAt?.(collisionPoint.x,collisionPoint.z,collisionPoint.y+.02) ?? world.groundAt(collisionPoint.x, collisionPoint.z);
          if (collisionPoint.y <= height) contactHeight = Math.max(contactHeight ?? -Infinity, height);
        }
        if (contactHeight !== undefined) {
          attitude();
          ground.contact(fdm, state.roll, state.pitch, contactHeight);
          if (ground.crashed) {
            state.crashed = true;
            crashTime = accumulator;
            accumulator = 0;
            plane.root.enabled = false;
          }
        }
        if (state.crashed) break;
      }
      propAngle = (propAngle + fdm.controls.throttle * 2400 * duration) % 360;
      plane.prop.setLocalEulerAngles(0, 0, propAngle);
      publish();
    },
  };
}


function createHeliController({app,world,plane,state}:FlightContext,spawn?:VehicleSpawn,home=spawn):FlightModule {
  const body=new HeliDynamics(), point=new Vec3();
  let hitbox=plane.hitbox?.length?plane.hitbox:[[0,-1.2,0]];
  let clearance=Math.max(.1,...hitbox.map(p=>-p[1]));
  const rotor=plane as typeof plane & {propAxis?:'x'|'y'|'z';tailProp?:Entity};
  let accumulator=0, crashTime=0, angle=0, collective=0;
  const support=(x:number,z:number)=>world.surfaceAt?.(x,z,body.position.y+.35)??world.groundAt(x,z);
  let resetPoint=spawn;
  function publish() {
    Object.assign(state,{x:body.position.x,y:body.position.y,z:body.position.z,pitch:body.pitch,roll:body.roll,heading:body.heading,
      speed:state.crashed?0:body.velocity.length(),verticalSpeed:state.crashed?0:body.velocity.y,altitude:body.position.y,
      heightAboveGround:Math.max(0,body.position.y-support(body.position.x,body.position.z)),throttle:(collective+1)/2,stall:false});
    plane.root.setPosition(body.position);plane.root.setRotation(body.rotation);
  }
  function reset() {
    const start=resetPoint??SPAWN;resetPoint=home;
    body.reset(start.x,start===spawn?start.y:spawn?world.groundAt(start.x,start.z)+clearance:start.y,start.z,start.heading);
    body.grounded=!!spawn&&body.position.y<=world.groundAt(start.x,start.z)+clearance+.02;
    accumulator=crashTime=collective=0;state.crashed=false;plane.root.enabled=true;publish();
  }
  reset();
  return {update(dt) {
    if(app.keyboard?.wasPressed(KEY_R)){reset();return;}
    if(!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.25);
    hitbox=plane.hitbox?.length?plane.hitbox:hitbox;
    clearance=Math.max(.1,...hitbox.map(p=>-p[1]));
    if(body.grounded)body.position.y=support(body.position.x,body.position.z)+clearance;
    if(state.crashed){crashTime+=dt;if(crashTime>=2)reset();else publish();return;}
    const k=app.keyboard;
    const input:HeliControls={forward:Number(!!k?.isPressed(KEY_W))-Number(!!k?.isPressed(KEY_S)),
      right:Number(!!k?.isPressed(KEY_D))-Number(!!k?.isPressed(KEY_A)),
      yaw:Number(!!k?.isPressed(KEY_E))-Number(!!k?.isPressed(KEY_Q)),
      collective:Number(!!k?.isPressed(KEY_SHIFT))-Number(!!k?.isPressed(KEY_CONTROL))};
    collective=input.collective;
    accumulator+=dt;
    while(accumulator>=FIXED_STEP) {
      accumulator-=FIXED_STEP;body.step(input,support,clearance);
      for(const p of hitbox) {
        body.rotation.transformVector(point.set(p[0],p[1],p[2]),point).add(body.position);
        const obstacle=world.obstacleAt?.(point.x,point.z,point.y,0,.01);
        const floor=obstacle?.top??world.surfaceAt?.(point.x,point.z,point.y+.02)??world.groundAt(point.x,point.z);
        if(point.y<floor-.01) {
          const centerFloor=support(body.position.x,body.position.z);
          const wallHit=floor-centerFloor>1.5||floor-point.y>1.5;
          const hardDrop=body.velocity.y<-6;
          const hardHorizontal=Math.hypot(body.velocity.x,body.velocity.z)>22;
          const extremeTilt=Math.abs(body.pitch)>60||Math.abs(body.roll)>60;
          if(wallHit||hardDrop||extremeTilt||hardHorizontal) {
            body.crashed=true;
          } else {
            body.position.y+=floor-point.y;
            if(body.velocity.y<0)body.velocity.y=0;
            const slide=Math.exp(-FIXED_STEP*6);
            body.velocity.x*=slide;body.velocity.z*=slide;
            if(input.collective<=0&&body.velocity.y<=.05)body.grounded=true;
          }
        }
      }
      if(body.crashed){state.crashed=true;plane.root.enabled=false;accumulator=0;break;}
    }
    angle=(angle+1800*dt)%360;
    const axis=rotor.propAxis??'y';
    plane.prop.setLocalEulerAngles(axis==='x'?angle:0,axis==='y'?angle:0,axis==='z'?angle:0);
    (rotor.tailProp??plane.tailRotor)?.setLocalEulerAngles(angle*2,0,0);publish();
  }};
}
