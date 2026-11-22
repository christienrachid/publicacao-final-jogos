// Shared physical and visual anchors for environmental traps.
export function floorTrapBox(state,trap,ground=940){
 const supports=state.solids.filter(p=>p.w>0&&p.h>=40&&trap.x>=p.x&&trap.x<=p.x+p.w&&p.y<=ground);
 const base=supports.length?Math.min(...supports.map(p=>p.y)):ground;
 const height=trap.type==='spikes'?70:320;
 return {x:trap.x-trap.w/2,y:base-height,w:trap.w,h:height,base};
}
export function pitTrapBox(pit,ground=940){
 const height=pit.depth/2;
 return {x:pit.x,y:ground+pit.depth-height,w:pit.w,h:height,base:ground+pit.depth};
}
