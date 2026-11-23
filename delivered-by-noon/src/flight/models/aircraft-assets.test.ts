import { expect, it } from 'vitest';
// @ts-expect-error Vitest runs in Node; the browser project has no @types/node dependency.
import { statSync } from 'node:fs';
import { getBounds, Logger, NodeIO, Verbosity } from '@gltf-transform/core';

it.each([
  {file:'helicoptero.glb',length:9,span:7.34225,pivots:['Rotor','TailRotor']},
  {file:'a29.glb',length:11.4,span:11.1,pivots:['Prop']},
])('$file keeps game axes, ground contact, rotor pivots and compact PBR textures',async({file,length,span,pivots})=>{
  const path=`public/models/${file}`;
  expect(statSync(path).size).toBeLessThanOrEqual(3_000_000);
  const doc=await new NodeIO().setLogger(new Logger(Verbosity.ERROR)).read(path),root=doc.getRoot();
  const bounds=getBounds(root.listScenes()[0]);
  expect(bounds.min[1]).toBeCloseTo(0,5);
  expect(bounds.max[2]-bounds.min[2]).toBeCloseTo(length,4);
  expect(bounds.max[0]-bounds.min[0]).toBeCloseTo(span,4);
  expect(bounds.max[0]+bounds.min[0]).toBeCloseTo(0,5);
  expect(bounds.max[2]+bounds.min[2]).toBeCloseTo(0,5);
  expect(root.listAnimations()).toHaveLength(0);
  for(const name of pivots) {
    const matches=root.listNodes().filter(n=>n.getName()===name);
    expect(matches).toHaveLength(1);
    const node=matches[0];
    expect(node.listChildren().length).toBeGreaterThan(0);
    // Identity local axes preserve Y main-rotor / X tail-rotor / Z propeller controls.
    expect(node.getRotation()).toEqual([0,0,0,1]);
    expect(node.getScale()).toEqual([1,1,1]);
    const position=node.getWorldTranslation();
    expect(position[1]).toBeGreaterThan(1);
    if(name==='TailRotor')expect(position[2]).toBeGreaterThan(3);
    else expect(position[2]).toBeLessThan(-1);
    if(name==='Prop')expect(position[0]).toBeCloseTo(0,5);
  }
  expect(root.listMaterials().length).toBeGreaterThan(0);
  for(const material of root.listMaterials()) {
    expect(material.getBaseColorTexture()).not.toBeNull();
    expect(material.getNormalTexture()).not.toBeNull();
    expect(material.getMetallicRoughnessTexture()).not.toBeNull();
  }
  for(const texture of root.listTextures()) {
    expect(texture.getImage()).not.toBeNull();
    const size=texture.getSize();expect(size).not.toBeNull();
    expect(Math.max(...size!)).toBeLessThanOrEqual(1024);
  }
});
