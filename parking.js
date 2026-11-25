(() => {
  'use strict';

  const laneSize=32;
  const key=(x,z)=>Math.floor(x/laneSize)+','+Math.floor(z/laneSize);
  const blockedStreet=/East Washington|University Avenue|West Johnson|East Johnson|East Gorham|West Gorham/;

  function create(geo,layout,market,routes=[]) {
    const {data,streetCandidates,segmentDistance,ground,inBuilding,onWater,random}=geo;
    const rng=random(81396),slots=[],parked=[],spatial=new Map(),districts=new Map();
    const lanes=new Map(routes.filter(route=>route.name).map(route=>[route.name,route.line]));
    for(const [name,kind,width,bridge,line,rapid,driveway] of data.roads) {
      if(!name || kind>1 || width<7.1 || width>17.7 || bridge || rapid || driveway || blockedStreet.test(name)) continue;
      for(let i=1;i<line.length;i++) {
        const [ax,az]=line[i-1],[bx,bz]=line[i],length=Math.hypot(bx-ax,bz-az);
        if(length<14) continue;
        const dx=(bx-ax)/length,dz=(bz-az)/length;
        for(let along=5.2;along<=length-4.8;along+=8.9) for(const side of [1,-1]) {
          const offset=(width*.5-1.13)*side;
          const x=ax+dx*along-dz*offset,z=az+dz*along+dx*offset;
          if(onWater(x,z) || inBuilding(x,z,1.28) || market?.drivingBlocked(x,z,2)) continue;
          const lane=lanes.get(name);
          if(lane && lane.project(x,z).distance<2.26) continue;
          if(layout.signals.some(s=>Math.hypot(x-s.x,z-s.z)<20) ||
            layout.stops.some(([,a,b])=>Math.hypot(x-a,z-b)<16)) continue;
          if(streetCandidates(x,z).some(road=>{
            if(road.name===name || road.kind>2 || road.kind===2 && !road.name) return false;
            const {ax,az,bx,bz,width}=road;
            return segmentDistance(x,z,ax,az,bx,bz)<(width*.5+3.9)**2;
          })) continue;
          const sx=dx*side,sz=dz*side;
          if([-2.24,2.24].some(d=>inBuilding(x+sx*d,z+sz*d,1.06) || onWater(x+sx*d,z+sz*d))) continue;
          const slot={x,z,yaw:Math.atan2(sx,-sz),name,dx:sx,dz:sz,y:ground(x,z)};
          slots.push(slot);
          const district=Math.floor(x/132)+','+Math.floor(z/132);
          const used=districts.get(district) || 0;
          if(used>=3 || rng()>(Math.hypot(x*.71,z*.65)<1100?.065:.028) ||
            parked.some(p=>Math.abs(p.x-x)<5.8 && Math.abs(p.z-z)<5.8 && Math.hypot(p.x-x,p.z-z)<5.8)) continue;
          slot.occupied=true;
          const car={...slot,style:Math.floor(rng()*8)};
          parked.push(car);
          districts.set(district,used+1);
          const id=key(x,z);
          if(!spatial.has(id)) spatial.set(id,[]);
          spatial.get(id).push(car);
        }
      }
    }

    function collision(x,z,radius) {
      for(const a of [x-radius-2.6,x+radius+2.6]) for(const b of [z-radius-2.6,z+radius+2.6]) {
        for(const car of spatial.get(key(a,b)) || []) if(overlaps(car,x,z,radius)) return true;
      }
      return false;
    }
    function nearest(x,z,accept=()=>true) {
      let best=null,distance=260;
      for(const slot of slots) {
        if(slot.occupied) continue;
        const length=Math.hypot(x-slot.x,z-slot.z);
        if(length>distance || length<4 || collision(slot.x,slot.z,1.9) || !accept(slot)) continue;
        best=slot;
        distance=length;
      }
      return best;
    }
    return {parked,nearest,collision};
  }

  function overlaps(car,x,z,radius) {
    const dx=Math.sin(car.yaw),dz=-Math.cos(car.yaw),vx=x-car.x,vz=z-car.z;
    const across=Math.max(0,Math.abs(vx*dz-vz*dx)-.96),along=Math.max(0,Math.abs(vx*dx+vz*dz)-2.37);
    return across*across+along*along<radius*radius;
  }

  window.MadisonParking={create,overlaps};
})();
