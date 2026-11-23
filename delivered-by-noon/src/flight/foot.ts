import { type Entity, KEY_A, KEY_D, KEY_S, KEY_SHIFT, KEY_SPACE, KEY_W, Vec3 } from 'playcanvas';
import type { FlightContext, FlightModule } from './types';
import { publishGround, type GroundPhysics } from './car';

export interface FootInput { forward:number; right:number; run:boolean; jump:boolean; heading:number }
export class FootDynamics {
  x=0;y=0;z=0;heading=0;speed=0;pitch=0;roll=0;verticalSpeed=0;
  private jumpHeld=false;
  constructor(readonly world: GroundPhysics) {}
  reset(x:number,y:number,z:number,heading:number) { Object.assign(this,{x,y,z,heading,speed:0,verticalSpeed:0,jumpHeld:false}); }
  step(input: FootInput,dt:number) {
    const floor=this.world.surfaceAt(this.x,this.z,this.y+.35);
    const grounded=this.y<=floor+.02&&this.verticalSpeed<=0;
    if(input.jump&&!this.jumpHeld&&grounded)this.verticalSpeed=5.5;
    this.jumpHeld=input.jump;
    const length=Math.max(1,Math.hypot(input.forward,input.right));
    const speed=input.run?8:4, h=input.heading*Math.PI/180;
    const dx=(Math.sin(h)*input.forward+Math.cos(h)*input.right)/length*speed*dt;
    const dz=(-Math.cos(h)*input.forward+Math.sin(h)*input.right)/length*speed*dt;
    const p=this.world.moveCapsule(this,dx,dz,.35,1.8,.8);
    this.speed=Math.hypot(p.x-this.x,p.z-this.z)/dt;
    if(this.speed>.01)this.heading=(Math.atan2(p.x-this.x,-(p.z-this.z))*180/Math.PI+360)%360;
    this.x=p.x;this.z=p.z;this.y=Math.max(this.y,p.y);
    const oldY=this.y;
    this.verticalSpeed-=9.81*dt;
    const nextY=this.y+this.verticalSpeed*dt;
    const support=this.world.surfaceAt(this.x,this.z,Math.max(oldY,nextY)+.1);
    const ceiling=this.world.obstacleAt(this.x,this.z,nextY,.35,1.8);
    if(this.verticalSpeed>0&&ceiling){this.verticalSpeed=0;this.y=oldY;}
    else if(nextY<=support){this.y=support;this.verticalSpeed=0;}
    else this.y=nextY;
  }
}

const TWO_PI = Math.PI * 2;

interface CharacterRig {
  tronco: Entity | null;
  cabeca: Entity | null;
  bracoE: Entity | null;
  antebracoE: Entity | null;
  bracoD: Entity | null;
  antebracoD: Entity | null;
  pernaE: Entity | null;
  canelaE: Entity | null;
  pernaD: Entity | null;
  canelaD: Entity | null;
  troncoBaseX: number;
  troncoBaseY: number;
  troncoBaseZ: number;
  pernaEBaseX: number;
  pernaEBaseY: number;
  pernaEBaseZ: number;
  pernaDBaseX: number;
  pernaDBaseY: number;
  pernaDBaseZ: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function isDescendant(node: Entity | null, ancestor: Entity): boolean {
  let cur = node?.parent ?? null;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}

function resolveRig(root: Entity, cached: CharacterRig | null): CharacterRig | null {
  if (cached && isDescendant(cached.tronco, root)) return cached;
  if (typeof root.findByName !== 'function') return null;
  const find = (name: string): Entity | null => (root.findByName(name) as Entity | null) ?? null;
  const tronco = find('Tronco');
  const pernaE = find('PernaE');
  const pernaD = find('PernaD');
  if (!tronco && !pernaE && !pernaD) return null;
  const tp = tronco?.getLocalPosition();
  const pe = pernaE?.getLocalPosition();
  const pd = pernaD?.getLocalPosition();
  return {
    tronco,
    cabeca: find('Cabeca'),
    bracoE: find('BracoE'),
    antebracoE: find('AntebracoE'),
    bracoD: find('BracoD'),
    antebracoD: find('AntebracoD'),
    pernaE,
    canelaE: find('CanelaE'),
    pernaD,
    canelaD: find('CanelaD'),
    troncoBaseX: tp ? tp.x : 0,
    troncoBaseY: tp ? tp.y : 0.9,
    troncoBaseZ: tp ? tp.z : 0,
    pernaEBaseX: pe ? pe.x : -0.105,
    pernaEBaseY: pe ? pe.y : 0.88,
    pernaEBaseZ: pe ? pe.z : 0,
    pernaDBaseX: pd ? pd.x : 0.105,
    pernaDBaseY: pd ? pd.y : 0.88,
    pernaDBaseZ: pd ? pd.z : 0,
  };
}

function resetRigPose(rig: CharacterRig): void {
  rig.tronco?.setLocalPosition(rig.troncoBaseX, rig.troncoBaseY, rig.troncoBaseZ);
  rig.tronco?.setLocalEulerAngles(0, 0, 0);
  rig.cabeca?.setLocalEulerAngles(0, 0, 0);
  rig.bracoE?.setLocalEulerAngles(0, 0, 0);
  rig.antebracoE?.setLocalEulerAngles(0, 0, 0);
  rig.bracoD?.setLocalEulerAngles(0, 0, 0);
  rig.antebracoD?.setLocalEulerAngles(0, 0, 0);
  rig.pernaE?.setLocalPosition(rig.pernaEBaseX, rig.pernaEBaseY, rig.pernaEBaseZ);
  rig.pernaE?.setLocalEulerAngles(0, 0, 0);
  rig.canelaE?.setLocalEulerAngles(0, 0, 0);
  rig.pernaD?.setLocalPosition(rig.pernaDBaseX, rig.pernaDBaseY, rig.pernaDBaseZ);
  rig.pernaD?.setLocalEulerAngles(0, 0, 0);
  rig.canelaD?.setLocalEulerAngles(0, 0, 0);
}

export function createFootController(ctx:FlightContext,physics:GroundPhysics):FlightModule {
  const {state,app,plane,camera}=ctx, body=new FootDynamics(physics),forward=new Vec3();
  const input:FootInput={forward:0,right:0,run:false,jump:false,heading:0};
  body.reset(state.x,state.y,state.z,state.heading);
  let accumulator=0;
  let idlePhase=0;
  let gaitPhase=0;
  let moveBlend=0;
  let runBlend=0;
  let airBlend=0;
  let airAscent=0;
  let rig:CharacterRig|null=null;

  return {
    update(dt){
      if(!Number.isFinite(dt)||dt<=0)return;
      const frameDt=Math.min(dt,.25);
      camera.getRotation().transformVector(Vec3.FORWARD,forward);
      const heading=Math.atan2(forward.x,-forward.z)*180/Math.PI;
      const k=app.keyboard;
      input.forward=Number(!!k?.isPressed(KEY_W))-Number(!!k?.isPressed(KEY_S));
      input.right=Number(!!k?.isPressed(KEY_D))-Number(!!k?.isPressed(KEY_A));
      input.run=!!k?.isPressed(KEY_SHIFT);
      input.jump=!!k?.isPressed(KEY_SPACE);
      input.heading=heading;
      accumulator+=frameDt;
      while(accumulator>=1/120){body.step(input,1/120);accumulator-=1/120;}
      const floor=physics.surfaceAt(body.x,body.z,body.y+.1);
      publishGround(state,body,floor,body.verticalSpeed);
      plane.root.setPosition(body.x,body.y,body.z);plane.root.setLocalEulerAngles(0,-body.heading,0);

      // Animação procedural das juntas (sem skeleton, zero alocações por frame)
      rig=resolveRig(plane.root,rig);
      if(!rig)return;

      const speed=body.speed;
      const heightAboveGround=body.y-floor;
      const airborne=heightAboveGround>.12||Math.abs(body.verticalSpeed)>.65;
      const moveTarget=airborne?0:clamp01(speed/1.2);
      const runTarget=airborne?0:clamp01((speed-4.4)/3.2);
      const airTarget=airborne?1:0;
      const ascentTarget=Math.max(-1,Math.min(1,body.verticalSpeed/4.5));

      const blendRate=1-Math.exp(-10*frameDt);
      const airRate=1-Math.exp(-14*frameDt);
      moveBlend+=(moveTarget-moveBlend)*blendRate;
      runBlend+=(runTarget-runBlend)*blendRate;
      airBlend+=(airTarget-airBlend)*airRate;
      airAscent+=(ascentTarget-airAscent)*airRate;

      idlePhase=(idlePhase+frameDt*1.85)%TWO_PI;
      if(moveBlend>.01){
        const cadence=5.6+Math.min(speed,9)*1.42;
        gaitPhase=(gaitPhase+frameDt*cadence)%TWO_PI;
      }

      const groundWeight=1-airBlend;
      const locoWeight=moveBlend*groundWeight;
      const idleWeight=(1-moveBlend)*groundWeight;

      const breath=Math.sin(idlePhase);
      const s=Math.sin(gaitPhase);
      const cSwingL=Math.max(0,Math.cos(gaitPhase+.35));
      const cSwingR=Math.max(0,-Math.cos(gaitPhase+.35));
      const cStanceL=Math.max(0,-Math.cos(gaitPhase));
      const cStanceR=Math.max(0,Math.cos(gaitPhase));

      // Balanço de pernas e joelhos (PlayCanvas: +X inclina membro pendurado para frente/-Z)
      const legAmp=26+runBlend*22;
      const kneeAmp=32+runBlend*36;
      const walkHipL=s*legAmp;
      const walkHipR=-s*legAmp;
      const walkKneeL=-(4+cStanceL*6+cSwingL*kneeAmp);
      const walkKneeR=-(4+cStanceR*6+cSwingR*kneeAmp);

      // Pose de pulo (subida encolhida) / queda (pernas preparadas para pouso)
      const rise=clamp01(airAscent*.5+.5);
      const airHipL=14+rise*24;
      const airHipR=6-rise*24;
      const airKneeL=-(26+rise*32);
      const airKneeR=-(22+rise*10);

      const hipL=walkHipL*locoWeight+airHipL*airBlend;
      const hipR=walkHipR*locoWeight+airHipR*airBlend;
      const kneeL=walkKneeL*locoWeight+airKneeL*airBlend-2*idleWeight;
      const kneeR=walkKneeR*locoWeight+airKneeR*airBlend-2*idleWeight;

      // Balanço de braços em fase oposta às pernas + dobra natural de cotovelo (+X para frente)
      const armAmp=22+runBlend*24;
      const baseElbow=14+runBlend*46;
      const walkShL=-s*armAmp;
      const walkShR=s*armAmp;
      const walkElbL=baseElbow+Math.max(0,-s)*(12+runBlend*18);
      const walkElbR=baseElbow+Math.max(0,s)*(12+runBlend*18);

      const airShL=10+rise*28;
      const airShR=10-rise*14;
      const airElbL=32+rise*26;
      const airElbR=26+rise*18;

      const shL=walkShL*locoWeight+airShL*airBlend+breath*1.1*idleWeight;
      const shR=walkShR*locoWeight+airShR*airBlend+breath*1.1*idleWeight;
      const elbL=walkElbL*locoWeight+airElbL*airBlend+12*idleWeight;
      const elbR=walkElbR*locoWeight+airElbR*airBlend+12*idleWeight;
      const armOut=(3.5+breath*.7)*idleWeight+(5+runBlend*3)*locoWeight+(22-rise*6)*airBlend;

      // Oscilação vertical do tronco (respiração no idle, bob proporcional à velocidade no passo/corrida)
      const strideDrop=-Math.abs(s)*(.014+runBlend*.022)*locoWeight;
      const strideLift=(1-Math.abs(s))*(.012+runBlend*.022)*locoWeight;
      const hipOffsetY=strideDrop+strideLift;
      const troncoBobY=hipOffsetY+breath*.008*idleWeight;

      const troncoPitch=-(4+runBlend*9)*locoWeight-(4+rise*6)*airBlend+breath*1.0*idleWeight;
      const troncoYaw=s*(4+runBlend*5.5)*locoWeight;
      const troncoRoll=s*(1.6+runBlend*2.4)*locoWeight;

      // Cabeça estabilizada compensando torção e inclinação do tronco
      const headPitch=-troncoPitch*.55+breath*.9*idleWeight-(1-rise)*6*airBlend;
      const headYaw=-troncoYaw*.75+Math.sin(idlePhase*.45)*2.4*idleWeight;

      rig.tronco?.setLocalPosition(rig.troncoBaseX,rig.troncoBaseY+troncoBobY,rig.troncoBaseZ);
      rig.tronco?.setLocalEulerAngles(troncoPitch,troncoYaw,troncoRoll);
      rig.cabeca?.setLocalEulerAngles(headPitch,headYaw,-troncoRoll*.5);

      rig.bracoE?.setLocalEulerAngles(shL,0,-armOut);
      rig.antebracoE?.setLocalEulerAngles(elbL,0,0);
      rig.bracoD?.setLocalEulerAngles(shR,0,armOut);
      rig.antebracoD?.setLocalEulerAngles(elbR,0,0);

      rig.pernaE?.setLocalPosition(rig.pernaEBaseX,rig.pernaEBaseY+hipOffsetY,rig.pernaEBaseZ);
      rig.pernaE?.setLocalEulerAngles(hipL,0,0);
      rig.canelaE?.setLocalEulerAngles(kneeL,0,0);

      rig.pernaD?.setLocalPosition(rig.pernaDBaseX,rig.pernaDBaseY+hipOffsetY,rig.pernaDBaseZ);
      rig.pernaD?.setLocalEulerAngles(hipR,0,0);
      rig.canelaD?.setLocalEulerAngles(kneeR,0,0);
    },
    destroy(){
      if(rig&&isDescendant(rig.tronco,plane.root))resetRigPose(rig);
      rig=null;
    },
  };
}
