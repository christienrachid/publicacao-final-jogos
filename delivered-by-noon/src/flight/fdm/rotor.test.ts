// Tests of the FGRotor-derived LGPL-2.1-or-later subset; JSBSim-Team / LICENSE-JSBSim.txt.
import { expect, it } from 'vitest';
import { Rotor } from './rotor';
import { HeliDynamics } from './heli';
import data from './aircraft-md500.json';
const rho=1.225,weight=data.mass*9.80665,dt=1/120;
it('balances 1360kg hover with an 8.05m five-blade rotor and positive shaft torque',()=>{
  const rotor=new Rotor(data.main);rotor.reset(weight,rho);const theta=rotor.collectiveFor(weight,0,0,rho);
  for(let i=0;i<3600;i++)rotor.step(theta,0,0,rho,dt);
  expect(rotor.thrust).toBeCloseTo(weight,5);expect(rotor.torque).toBeGreaterThan(0);expect(rotor.power).toBeCloseTo(rotor.torque*data.main.rpm*Math.PI/30,5);
  expect(data.main.radius*2).toBe(8.05);expect(data.main.blades).toBe(5);
});
it('increases thrust/torque with collective and applies tail anti-torque',()=>{
  const rotor=new Rotor(data.main);rotor.reset(weight,rho);const baseTorque=rotor.torque;
  const theta=rotor.collectiveFor(weight,0,0,rho)+.05;
  for(let i=0;i<360;i++)rotor.step(theta,0,0,rho,dt);
  expect(rotor.thrust).toBeGreaterThan(weight);expect(rotor.torque).toBeGreaterThan(baseTorque);
  const tail=new Rotor(data.tail);tail.reset(rotor.torque/data.tailArm,rho);
  for(let i=0;i<120;i++)tail.step(tail.collectiveFor(rotor.torque/data.tailArm,0,0,rho),0,0,rho,dt);
  expect(tail.thrust*data.tailArm).toBeCloseTo(rotor.torque,5);
  for(let i=0;i<120;i++)tail.step(tail.collectiveFor(-300,0,0,rho),0,0,rho,dt);
  expect(tail.thrust).toBeLessThan(0);
});

it('right pedal yaws right while the aft tail rotor initially pushes left',()=>{
  const heli=new HeliDynamics();heli.reset(0,100,0,0);heli.step({forward:0,right:0,yaw:1,collective:0},()=>0,1.2);
  expect(heli.heading).toBeGreaterThan(0);expect(heli.velocity.x).toBeLessThan(0);
});
it('collective climbs and cyclic release levels the rotor/body while hover assist arrests drift',()=>{
  const heli=new HeliDynamics();heli.reset(0,100,0,0);
  for(let i=0;i<360;i++)heli.step({forward:0,right:0,yaw:0,collective:1},()=>0,1.2);
  expect(heli.velocity.y).toBeGreaterThan(5);expect(heli.position.y).toBeGreaterThan(110);
  for(let i=0;i<360;i++)heli.step({forward:0,right:0,yaw:0,collective:0},()=>0,1.2);
  for(let i=0;i<360;i++)heli.step({forward:1,right:0,yaw:0,collective:0},()=>0,1.2);
  const speed=heli.velocity.length();expect(speed).toBeGreaterThan(20);
  for(let i=0;i<1200;i++)heli.step({forward:0,right:0,yaw:0,collective:0},()=>0,1.2);
  expect(Math.abs(heli.pitch)).toBeLessThan(.01);expect(heli.velocity.length()).toBeLessThan(1);
});
