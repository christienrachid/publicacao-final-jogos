import { afterEach, expect, it, vi } from 'vitest';
import { calculateNormals, Entity } from 'playcanvas';
import { AIRPORT, CITY, CITY_CREDITS, HANGAR, ROAD_CLASSES, UNIACADEMIA, WORKSHOP, airportData, cityData, cityDetails, cityLayout, cityStreetImages, CRISTO_IMPERADOR, buildingColliders, createWorldPhysics, deliveryRampData, landmarkBoxes, MARCOS, protectedSpots, roadHeightAt, roadJunctions, nearestRoad, terrainData, terrainHeight } from './world-data';
import { buildWorld } from './world';
import { CarDynamics } from './car';
import { deliveryPoints } from './mission';
import jfRaw from './jf-mundo.json';
import type { FlightContext } from './types';

vi.mock('playcanvas',async importOriginal=>{
  const pc=await importOriginal<typeof import('playcanvas')>();
  const app={_entityIndex:{},systems:{}} as unknown as FlightContext['app'];
  class TestEntity extends pc.Entity {
    constructor(name='Entity'){super(name,app);}
    addComponent(type:string,data:unknown){if(type==='render')Object.defineProperty(this,'render',{value:data,writable:true,configurable:true});return null;}
  }
  class TestMesh {
    setPositions(){} setNormals(){} setColors32(){} setUvs(){} setIndices(){} update(){}
  }
  class TestTexture {setSource(){} }
  class TestMeshInstance {constructor(public mesh:unknown,public material:unknown){}}
  return {...pc,Entity:TestEntity,Mesh:TestMesh,Texture:TestTexture,MeshInstance:TestMeshInstance};
});
afterEach(()=>vi.unstubAllGlobals());

it('builds Juiz de Fora from real data: relief, road categories, river, parks, landmarks and runway',()=>{
  const city=cityData(),layout=cityLayout(),details=cityDetails(city);
  expect(layout.buildings).toEqual(city.boxes);expect(layout.blocks).toEqual(city.blocks);
  expect(city.boxes.length).toBeGreaterThan(300);expect(city.boxes.length).toBeLessThan(6000);
  expect(layout.roadLines.map(r=>r.category)).toEqual([...ROAD_CLASSES]);
  for(const road of layout.roadLines)expect(road.lines.length).toBeGreaterThan(0);
  expect(layout.river.lines.length).toBeGreaterThan(0);expect(layout.parkPolygons.length).toBeGreaterThan(10);
  expect(layout.stadiumPolygons.length).toBeGreaterThan(0);expect(layout.universityPolygons.length).toBeGreaterThan(0);
  expect(layout.runwayLine.a.x).toBe(layout.runwayLine.b.x);expect(layout.runwayLine.heading).toBe(0);
  expect(layout.helipad.y).toBe(city.helipad.y);expect(layout.workshop.x).toBe(WORKSHOP.x);
  expect(layout.landmarks.uniacademia).toMatchObject({x:UNIACADEMIA.x,z:UNIACADEMIA.z});
  expect(CITY_CREDITS).toContain('OpenStreetMap');
  expect(cityDetails(city)).toEqual(details);expect(cityData()).toBe(city);
  expect(Object.keys(details.meshes)).toEqual(['roads','ground','props','lamps']);
  for(const mesh of Object.values(details.meshes)) {
    expect(mesh.pos.every(Number.isFinite)).toBe(true);expect(mesh.normals).toHaveLength(mesh.pos.length);
    expect(mesh.idx.every(i=>i>=0&&i<mesh.pos.length/3)).toBe(true);
  }
  expect(details.meshes.roads.uv).toHaveLength(details.meshes.roads.pos.length/3*2);
});

it('keeps terrain between 2 m and the real hills, flat under the runway and shared with the mesh',()=>{
  const terrain=terrainData();let min=Infinity,max=-Infinity;
  for(let i=1;i<terrain.pos.length;i+=3){min=Math.min(min,terrain.pos[i]);max=Math.max(max,terrain.pos[i]);}
  expect(min).toBeGreaterThanOrEqual(2);expect(max).toBeGreaterThan(150);expect(max).toBeLessThan(400);
  for(const z of [10,200,AIRPORT.z,700])expect(terrainHeight(AIRPORT.x,z)).toBeCloseTo(AIRPORT.y-.05,6);
  // a mesh vertex must equal the physics height exactly
  const i=Math.floor(terrain.pos.length/3/2);expect(terrainHeight(terrain.pos[i*3],terrain.pos[i*3+2])).toBeCloseTo(terrain.pos[i*3+1],4);
  expect(CITY.x1-CITY.x0).toBeGreaterThan(4000);
});

it('places buildings off the roads and keeps the lots of the university and workshop free',()=>{
  const city=cityData(),world=createWorldPhysics([...city.boxes]);
  for(const b of city.boxes.slice(0,200)){
    const x=(b.x0+b.x1)/2,z=(b.z0+b.z1)/2;expect(world.obstacleAt(x,z,b.bottom!+1,.35,1.8)).toBeDefined();
  }
  for(const b of city.boxes) {
    expect(Math.hypot((b.x0+b.x1)/2-UNIACADEMIA.x,(b.z0+b.z1)/2-UNIACADEMIA.z)).toBeGreaterThan(UNIACADEMIA.radius);
    expect(Math.hypot((b.x0+b.x1)/2-WORKSHOP.x,(b.z0+b.z1)/2-WORKSHOP.z)).toBeGreaterThan(14);
  }
  const road=nearestRoad(UNIACADEMIA.x,UNIACADEMIA.z,4)!;expect(road.distance).toBeGreaterThan(UNIACADEMIA.depth/2-2);expect(road.distance).toBeLessThan(UNIACADEMIA.depth/2+8); // entrada de frente para a rua, sem invadir a pista
  expect(landmarkBoxes()).toHaveLength(3);
});

it('uses circular collisions for poles/signals instead of invisible square corners',()=>{
  const details=cityDetails(),poles=details.boxes.filter(b=>b.radius!==undefined&&b.top-b.bottom!>6);
  expect(poles.length).toBeGreaterThan(300);expect(poles.length).toBeLessThan(3000);
  const pole=poles[0],r=pole.radius!,x=pole.x!,z=pole.z!,world=createWorldPhysics([pole]);
  expect(world.obstacleAt(x,z,pole.bottom!,.35,1.8)).toBe(pole);
  expect(world.obstacleAt(x+r*.9,z+r*.9,pole.bottom!,0,1.8)).toBeUndefined();
  expect(world.surfaceAt(x+r*.9,z+r*.9)).toBeLessThan(pole.top);
});

it('keeps the workshop, helipad access and hangar doorway open',()=>{
  const world=createWorldPhysics(),access=airportData().access[0];
  expect(world.obstacleAt(WORKSHOP.x,WORKSHOP.z,WORKSHOP.y,2.7,1.5)).toBeUndefined();
  expect(world.obstacleAt(access.x,access.z,access.y+.15,.35,1.8)).toBeUndefined();
  expect(world.obstacleAt((HANGAR.x0+HANGAR.x1)/2,HANGAR.z1-1,AIRPORT.y,2.7,1.5)).toBeUndefined();
  const images=cityStreetImages();expect(images.road.rectangles.some(r=>r.color==='#e9bd43')).toBe(false); // sem tracejado amarelo
  expect(images.road.rectangles.some(r=>r.color==='#eee9d5'&&r.height>20)).toBe(true); // linhas brancas e seta de sentido
});

it('exposes the actual batched emissive street material without creating dynamic lights',()=>{
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){},createLinearGradient:()=>({addColorStop(){}})})})});
  const root=new Entity('world');
  const app={root,graphicsDevice:{}} as unknown as FlightContext['app'];
  const world=buildWorld(app,root),lamp=root.findByName('Lampadas dos postes') as Entity;
  expect(world.streetLightMaterial?.name).toBe('Lampadas dos postes');
  expect(world.streetLightMaterial?.emissiveIntensity).toBe(1.8);
  expect((lamp.render!.meshInstances[0] as unknown as {material:unknown}).material).toBe(world.streetLightMaterial);
  expect(root.findComponents('light')).toHaveLength(0);
  expect(root.children.filter(c=>c.name.startsWith('Cidade - '))).toHaveLength(3);
});

it('lays roads at the shared physics height and aligns the three tuned ramps with axes and relief',()=>{
  const world=createWorldPhysics(),road=nearestRoad(0,-1300,3)!;
  expect(roadHeightAt(road.x,road.z)).toBeGreaterThanOrEqual(terrainHeight(road.x,road.z));
  expect(world.groundAt(road.x,road.z)).toBeCloseTo(roadHeightAt(road.x,road.z),8);
  for(const w of cityDetails().meshes.roads.pos.slice(0,300).filter((_,i)=>i%3===0)) expect(Number.isFinite(w)).toBe(true);
  const ramps=deliveryRampData();expect(ramps.ramps).toHaveLength(0);expect(ramps.boxes).toHaveLength(0);
  for(const r of ramps.ramps){expect(r.x0===r.x1||r.z0===r.z1).toBe(true);expect(r.y1).toBeGreaterThan(r.y0+3.9);}
});

it('keeps every road triangle face-up and continuously above the terrain without dipping under slopes',()=>{
  const roads=cityDetails().meshes.roads;
  let upsideDown=0,belowTerrain=0;
  for(let t=0;t<roads.idx.length;t+=3){
    const i0=roads.idx[t]*3,i1=roads.idx[t+1]*3,i2=roads.idx[t+2]*3;
    const ax=roads.pos[i0],ay=roads.pos[i0+1],az=roads.pos[i0+2];
    const bx=roads.pos[i1],by=roads.pos[i1+1],bz=roads.pos[i1+2];
    const cx=roads.pos[i2],cy=roads.pos[i2+1],cz=roads.pos[i2+2];
    if((bz-az)*(cx-ax)-(bx-ax)*(cz-az)<=0) upsideDown++;
    for(const [u,v] of [[0,0],[1,0],[0,1],[.5,0],[0,.5],[.5,.5],[.33,.33]]){
      const w=1-u-v,x=ax*w+bx*u+cx*v,y=ay*w+by*u+cy*v,z=az*w+bz*u+cz*v;
      if(y<terrainHeight(x,z)+.12) belowTerrain++;
    }
  }
  expect(upsideDown).toBe(0);
  expect(belowTerrain).toBe(0);
});

it('gives every neighbourhood building an oriented-box collider and keeps rotated corners honest',()=>{
  const colliders=buildingColliders();
  expect(colliders.length).toBeGreaterThan(1000);
  const world=createWorldPhysics(colliders,3);
  for(const b of colliders.filter((_,i)=>i%25===0)) {
    const q=b.obb!;expect(world.obstacleAt(q.cx,q.cz,b.bottom!+.5,.35,1.8)).toBe(b);
    expect(world.surfaceAt(q.cx,q.cz)).toBeGreaterThanOrEqual(b.top);
  }
  // quadrado girado 45°: o canto da caixa envolvente está livre, o eixo está ocupado
  const c=Math.SQRT1_2,box={x0:-14.2,x1:14.2,z0:-14.2,z1:14.2,top:20,bottom:0,obb:{cx:0,cz:0,hw:10,hd:10,rx:c,rz:c}};
  const rotated=createWorldPhysics([box],0);
  expect(rotated.obstacleAt(13,13,0,.3,1.8)).toBeUndefined();expect(rotated.obstacleAt(13,0,0,.3,1.8)).toBe(box);
});

it('keeps all buildings off the roads, deliveries, parked cars and workshop (so the GPS is never blocked)',()=>{
  const boxes=[...cityData().boxes,...buildingColliders()],world=createWorldPhysics(boxes,0);
  let samples=0;
  for(const cat of cityLayout().roadLines) for(const line of cat.lines) for(let i=0;i+3<line.length;i+=2) {
    const dx=line[i+2]-line[i],dz=line[i+3]-line[i+1],len=Math.hypot(dx,dz),n=Math.max(1,Math.floor(len/12));
    for(let k=0;k<=n;k++) {
      const x=line[i]+dx*k/n,z=line[i+1]+dz*k/n;samples++;
      expect(world.obstacleAt(x,z,0,Math.max(1.2,cat.width/2-.5),30),`prédio sobre a rua ${cat.category} em (${x.toFixed(0)},${z.toFixed(0)})`).toBeUndefined();
    }
  }
  expect(samples).toBeGreaterThan(5000);
  for(const p of protectedSpots()) expect(world.obstacleAt(p.x,p.z,0,Math.max(2,p.r-6),30),`prédio em lugar protegido (${p.x.toFixed(0)},${p.z.toFixed(0)})`).toBeUndefined();
  // cada entrega no chão tem um lugar protegido (espelha mission.deliveryPoints)
  for(const d of deliveryPoints().filter(d=>d.id!=='tuned-4'&&!d.airDrop&&Math.abs(d.y-terrainHeight(d.x,d.z))<4&&d.stage!=='heli'||d.id==='heli-3'||d.id==='heli-4'))
    expect(protectedSpots().some(p=>Math.hypot(p.x-d.x,p.z-d.z)<5),`entrega sem lugar protegido: ${d.id}`).toBe(true);
});

it('paints each junction as one smooth asphalt disc whose height meets the roads around it',()=>{
  const junctions=roadJunctions();expect(junctions.length).toBeGreaterThan(300);
  const steps:number[]=[];
  for(const j of junctions) for(let k=0;k<16;k++) {
    const a=k/16*Math.PI*2+.1,inner=roadHeightAt(j.x+Math.cos(a)*(j.r-.15),j.z+Math.sin(a)*(j.r-.15)),outer=roadHeightAt(j.x+Math.cos(a)*(j.r+.15),j.z+Math.sin(a)*(j.r+.15));
    if(inner>-Infinity&&outer>-Infinity)steps.push(Math.abs(inner-outer));
  }
  steps.sort((x,y)=>x-y);
  expect(steps.length).toBeGreaterThan(3000);
  expect(steps[Math.floor(steps.length*.95)],'95% das emendas do disco').toBeLessThan(.12);
  expect(steps[steps.length-1],'pior emenda').toBeLessThan(.5);
});

it('smooths OSM corners with a spline that keeps the line ends, and adds sidewalks with a drivable curb ramp downtown',()=>{
  const raw=(jfRaw as unknown as {vias:Record<string,number[][]>}).vias,lines=cityLayout().roadLines;
  const turns=(ls:number[][])=>{let sum=0,max=0;for(const l of ls)for(let i=2;i+3<l.length;i+=2){const ax=l[i]-l[i-2],az=l[i+1]-l[i-1],bx=l[i+2]-l[i],bz=l[i+3]-l[i+1],la=Math.hypot(ax,az),lb=Math.hypot(bx,bz);if(la<1e-6||lb<1e-6)continue;const t=Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/la/lb)));sum+=t>.6?1:0;max=Math.max(max,t);}return {sum,max};};
  // malha simplificada (mão única, sem pistas duplas/cotos): não cresce e continua suave (menos quinas por vértice que o OSM bruto)
  const vertices=(ls:number[][])=>ls.reduce((n,l)=>n+l.length/2,0);
  for(const [k,cat] of lines.entries()) {
    const before=raw[cat.category];
    expect(cat.lines.length).toBeLessThanOrEqual(before.length);expect(cat.lines.length).toBeGreaterThan(0);
    if(k>=2)expect(turns(cat.lines).sum/vertices(cat.lines),`quinas > 34° por vértice em ${cat.category}`).toBeLessThan(turns(before).sum/vertices(before)*.8);
  }
  expect(lines.every(c=>c.width===7)).toBe(true); // largura única
  // calçada: nas vias do Centro (inclusive em ladeira) o carro nunca encontra subida > maxSlope 0,55 por eixo e há meio-fio de verdade
  const world=createWorldPhysics(),c=MARCOS.centro;
  let steep=0,curbs=0,samples=0;
  for(const cat of lines) for(const l of cat.lines) {
    if(Math.hypot(l[0]-c[0],l[1]-c[1])>550)continue;
    for(let i=0;i+3<l.length;i+=6) {
      const dx=l[i+2]-l[i],dz=l[i+3]-l[i+1],len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len,half=cat.width/.72/2;
      let prev=-Infinity;
      for(let off=-half;off<=half;off+=.1) {
        const x=l[i]+nx*off,z=l[i+1]+nz*off,g=world.groundAt(x,z);samples++;
        if(Math.max((world.groundAt(x+.1,z)-g)/.1,(g-world.groundAt(x-.1,z))/.1,(world.groundAt(x,z+.1)-g)/.1,(g-world.groundAt(x,z-.1))/.1)>.55)steep++;
        if(prev>-Infinity&&Math.abs(g-prev)>.08*.12/.1*.5)curbs++;
        prev=g;
      }
    }
  }
  expect(samples).toBeGreaterThan(5000);
  expect(curbs,'trechos com meio-fio medido na física').toBeGreaterThan(50);
  // só restam pontos isolados nas bordas dos discos de cruzamento (já existiam antes da calçada: eram 9 no HEAD)
  expect(steep,'amostras com subida > 0,55 por eixo').toBeLessThanOrEqual(12);
});

it('builds QuickRoad-style junctions: streets cut at a setback, filleted polygon around the centre, no step at its edge',()=>{
  const all=roadJunctions(),qr=all.filter(j=>!j.fallback);
  expect(qr.length).toBeGreaterThan(80);expect(all.length-qr.length).toBeGreaterThan(0);
  const inside=(j:typeof qr[number],x:number,z:number)=>{let c=false;for(let i=0,k=j.poly.length-1;i<j.poly.length;k=i++){const a=j.poly[i],b=j.poly[k];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)c=!c;}return c;};
  const steps:number[]=[];
  for(const j of qr) {
    expect(j.poly.length).toBeGreaterThanOrEqual(6);expect(j.r).toBeLessThan(40);expect(inside(j,j.x,j.z),`centro dentro do polígono (${j.x.toFixed(0)},${j.z.toFixed(0)})`).toBe(true);
    for(let i=0;i<j.poly.length;i++) {
      const a=j.poly[i],b=j.poly[(i+1)%j.poly.length],mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,l=Math.hypot(mx-j.x,mz-j.z)||1,ux=(mx-j.x)/l,uz=(mz-j.z)/l;
      if(inside(j,mx+ux*.25,mz+uz*.25)||!inside(j,mx-ux*.25,mz-uz*.25))continue;
      const hi=roadHeightAt(mx-ux*.25,mz-uz*.25),ho=Math.max(terrainHeight(mx+ux*.25,mz+uz*.25),roadHeightAt(mx+ux*.25,mz+uz*.25));
      if(hi>-Infinity)steps.push(Math.abs(hi-ho));
    }
  }
  steps.sort((x,y)=>x-y);expect(steps.length).toBeGreaterThan(300);
  expect(steps[Math.floor(steps.length*.95)],'95% das bordas do miolo').toBeLessThan(.2);
});

it('lets a car climb the wide helipad tower ramp (slope <= 0.35, flush deck and bridge) at about 40 km/h up to the roof',()=>{
  const air=airportData(),world=createWorldPhysics(),car=new CarDynamics(world);
  // inclinação máxima de cada trecho de rampa e patamares planos entre eles
  for(const b of air.boxes.filter(b=>b.ramp&&Math.abs(b.ramp.y1-b.ramp.y0)>.01)) {
    const r=b.ramp!,slope=Math.abs(r.y1-r.y0)/Math.hypot(r.x1-r.x0,r.z1-r.z0);expect(slope).toBeLessThanOrEqual(.35);
    expect(Math.min(b.x1-b.x0,b.z1-b.z0)).toBeGreaterThanOrEqual(6);
  }
  expect(air.parts.some(p=>p.name==='Guarda-corpo da rampa')).toBe(true);
  const start=air.access[0];car.reset(start.x,start.y,start.z+3,0);
  let topSpeed=0,t=0;const dt=1/120;
  for(const target of air.access.slice(1)) {
    for(let i=0;i<60/dt&&Math.hypot(target.x-car.x,target.z-car.z)>3;i++,t+=dt) {
      const want=Math.atan2(target.x-car.x,-(target.z-car.z))*180/Math.PI,err=((want-car.heading+540)%360)-180;
      car.step({drive:car.speed<11?1:0,steer:Math.max(-1,Math.min(1,err/25)),handbrake:false},dt);topSpeed=Math.max(topSpeed,car.speed);
    }
    expect(Math.hypot(target.x-car.x,target.z-car.z),`carro travou antes de ${JSON.stringify(target)} em (${car.x.toFixed(1)},${car.z.toFixed(1)},y ${car.y.toFixed(1)})`).toBeLessThanOrEqual(3.5);
  }
  expect(car.y).toBeGreaterThan(air.helipad.y-1.5);expect(topSpeed).toBeGreaterThan(9);
});

it('keeps the Cristo hilltop free of buildings (only the cross and the heli delivery)',()=>{
  const boxes=[...cityData().boxes,...buildingColliders()],c=CRISTO_IMPERADOR;
  for(const b of boxes) expect(Math.hypot((b.x0+b.x1)/2-c.x,(b.z0+b.z1)/2-c.z),'prédio no topo do morro').toBeGreaterThan(110);
});
