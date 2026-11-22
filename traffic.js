(() => {
  'use strict';

  const T=THREE;
  const avenue='East Washington Avenue';
  const cycle=44, green=18.5, yellow=21;
  const signalPhase=(signal,axis,time)=>(time+signal.phase+axis*cycle/2)%cycle;

  function corridor(roads,direction) {
    const edges=roads.filter(([name,kind,width,,line])=>name===avenue && kind<=1 && width>=7.5 &&
      (line.at(-1)[0]-line[0][0])*direction>.12 && Math.min(line[0][0],line.at(-1)[0])>=162);
    const key=point=>point.join(',');
    const starts=new Map(), tails=new Set();
    for(const edge of edges) {
      starts.set(key(edge[4][0]),edge);
      tails.add(key(edge[4].at(-1)));
    }
    let longest=[],length=0;
    for(const edge of edges) {
      if(tails.has(key(edge[4][0]))) continue;
      const chain=[];
      let part=edge, distance=0;
      while(part && !chain.includes(part)) {
        chain.push(part);
        const line=part[4];
        for(let i=1;i<line.length;i++) distance+=Math.hypot(line[i][0]-line[i-1][0],line[i][1]-line[i-1][1]);
        part=starts.get(key(line.at(-1)));
      }
      if(distance>length) { longest=chain; length=distance; }
    }
    return longest;
  }

  function path(points) {
    const segments=[];
    let length=0;
    for(let i=1;i<points.length;i++) {
      const [a,b]=[points[i-1],points[i]],dx=b[0]-a[0],dz=b[1]-a[1];
      const span=Math.hypot(dx,dz);
      if(span<.025) continue;
      segments.push({a,b,dx:dx/span,dz:dz/span,span,start:length});
      length+=span;
    }
    function sample(s) {
      const at=Math.min(length,Math.max(0,s));
      let low=0,high=segments.length-1;
      while(low<high) {
        const mid=(low+high)>>1;
        if(segments[mid].start+segments[mid].span<at) low=mid+1;
        else high=mid;
      }
      const {a,dx,dz,start}=segments[low],t=at-start;
      return [a[0]+dx*t,a[1]+dz*t,dx,dz];
    }
    function project(x,z) {
      let nearest;
      for(const {a,start,dx,dz,span} of segments) {
        const along=Math.min(span,Math.max(0,(x-a[0])*dx+(z-a[1])*dz));
        const distance=Math.hypot(x-a[0]-dx*along,z-a[1]-dz*along);
        if(!nearest || distance<nearest.distance) nearest={s:start+along,distance,dx,dz};
      }
      return nearest;
    }
    return {sample,project,length};
  }

  function runningLane(chain,kind,stops) {
    const controls=[];
    for(const [, ,width,,line] of chain) {
      const bus=width/2-1.81;
      const offset=kind==='bus'?bus:kind==='outer'?1.83-width/2:Math.min(0,1.83-width/2+3.31);
      for(let i=1;i<line.length;i++) {
        const [a,b]=[line[i-1],line[i]],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
        if(len<.025) continue;
        const last=controls.at(-1);
        if(last) { last[2]=(last[2]+offset)*.5; }
        else controls.push([...a,offset]);
        controls.push([...b,offset]);
      }
    }
    const points=controls.map(([x,z,off],i)=>{
      const a=controls[Math.max(0,i-1)],b=controls[Math.min(i+1,controls.length-1)];
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      return [x+(b[1]-a[1])*off/length,z-(b[0]-a[0])*off/length];
    });
    if(kind!=='bus') return path(points);
    const original=path(points);
    // Keep the body clear of the platform, including places where the lane narrows at an intersection.
    const platforms=stops.map(([name,x,z])=>({name,x,z,...original.project(x,z)})).filter(stop=>stop.distance<10);
    const aligned=[];
    const steps=Math.ceil(original.length/4);
    for(let i=0;i<=steps;i++) {
      const s=i*original.length/steps;
      const [x,z,dx,dz]=original.sample(s);
      let nudge=0;
      for(const stop of platforms) {
        if(Math.abs(s-stop.s)>33) continue;
        const side=(x-stop.x)*(-dz)+(z-stop.z)*dx;
        const end=Math.min(1,(33-Math.abs(s-stop.s))/15);
        nudge=(3.61-side)*end*end*(3-2*end);
      }
      aligned.push([x-dz*nudge,z+dx*nudge]);
    }
    return path(aligned);
  }

  function trafficRoutes(roads,layout) {
    const routes=[];
    for(const direction of [1,-1]) {
      const chain=corridor(roads,direction);
      if(!chain.length) continue;
      for(const kind of ['bus','center','outer']) {
        const line=runningLane(chain,kind,layout.stops);
        const signals=[];
        for(const signal of layout.signals) {
          const {s,distance,dx,dz}=line.project(signal.x,signal.z);
          if(distance>17 || s<17 || s>line.length-16) continue;
          const scores=signal.axes.map(road=>Math.abs(road.dx*dx+road.dz*dz));
          const axis=scores[0]>=scores[1]?0:1;
          if(scores[axis]<.80) continue;
          signals.push({s:s-signal.axes[1-axis].extent-3.8,signal,axis});
        }
        const stations=kind==='bus'?layout.stops.flatMap(([name,x,z])=>{
          const stop=line.project(x,z);
          if(stop.distance>7 || stop.s<22 || stop.s>line.length-15) return [];
          return [{name,s:stop.s+7.4}];
        }).sort((a,b)=>a.s-b.s):[];
        routes.push({kind,direction,line,signals:signals.sort((a,b)=>a.s-b.s),stations,vehicles:[]});
      }
    }
    return routes;
  }

  function updateRoute(route,dt,time,playerOnLane) {
    const {vehicles,line,stations,signals}=route;
    vehicles.sort((a,b)=>b.s-a.s);
    for(let index=0;index<vehicles.length;index++) {
      const car=vehicles[index],leader=vehicles[index-1];
      if(car.dwell>0) {
        car.dwell=Math.max(0,car.dwell-dt);
        car.braking=true;
        if(car.dwell===0) car.stop++;
        continue;
      }
      if(car.s>=line.length-.01) {
        const queue=vehicles.at(-1);
        if(queue!==car && queue.s<car.length+16) continue;
        car.s=car.length;
        car.speed=car.cruise*.63;
        car.stop=0;
        car.braking=false;
        continue;
      }
      const station=stations[car.stop];
      let barrier=station?.s ?? Infinity;
      const upcoming=signals.find(light=>light.s>=car.s-.04);
      if(upcoming) {
        const phase=signalPhase(upcoming.signal,upcoming.axis,time);
        const gap=upcoming.s-car.s;
        if(phase>=yellow || phase>=green && gap>=car.speed*car.speed/8.4) barrier=Math.min(barrier,upcoming.s);
      }
      if(leader) barrier=Math.min(barrier,leader.s-leader.length-2.4);
      if(playerOnLane && playerOnLane.distance<1.95 && playerOnLane.s>car.s && playerOnLane.s-car.s<84) {
        barrier=Math.min(barrier,playerOnLane.s-3.7);
      }
      const space=Math.max(0,barrier-car.s);
      const goal=Math.min(car.cruise,Math.sqrt(space*(car.bus?4.1:5.6)));
      const previous=car.speed;
      const acceleration=goal<previous?(car.bus?4.0:5.6):(car.bus?1.32:2.37);
      car.speed=previous+Math.sign(goal-previous)*Math.min(Math.abs(goal-previous),dt*acceleration);
      const advance=car.speed*dt;
      car.s=Math.min(line.length,car.s+Math.min(advance,space));
      if(advance>=space) car.speed=0;
      car.braking=car.speed<previous-.015 || car.speed<.22 && space<1.2;
      if(station && station.s-car.s<.12 && station.s<=barrier+.01) {
        car.s=station.s;
        car.speed=0;
        car.dwell=car.dwellTime;
      }
    }
  }

  function signTexture(label,background,color) {
    const canvas=document.createElement('canvas');
    canvas.width=512;
    canvas.height=96;
    const ink=canvas.getContext('2d');
    if(background) {
      ink.fillStyle=background;
      ink.fillRect(0,0,512,96);
    }
    ink.font='800 57px sans-serif';
    ink.textAlign='center';
    ink.textBaseline='middle';
    ink.fillStyle=color;
    ink.fillText(label,256,49,482);
    const map=new T.CanvasTexture(canvas);
    map.colorSpace=T.SRGBColorSpace;
    return new T.MeshBasicMaterial({map,alphaTest:.28});
  }

  function shell(sections,material) {
    const vertices=[],indices=[];
    for(const [z,width,bottom,top] of sections) {
      const round=Math.min((top-bottom)*.33,.17);
      vertices.push(-width*.82,bottom,z, -width,bottom+round,z,-width,top-round,z,-width*.83,top,z,
        width*.83,top,z,width,top-round,z,width,bottom+round,z,width*.82,bottom,z);
    }
    for(let row=0;row<sections.length-1;row++) for(let column=0;column<8;column++) {
      const a=row*8+column,b=row*8+(column+1)%8;
      indices.push(a,b,b+8,a,b+8,a+8);
    }
    const last=vertices.length/3-8;
    for(let i=1;i<7;i++) indices.push(0,i+1,i,last,last+i,last+i+1);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new T.Mesh(geometry,material);
  }

  function vehicleModels(scene,geo) {
    const {box,cylinder,mergeLandmark}=geo;
    const coat=color=>new T.MeshLambertMaterial({color,side:T.DoubleSide});
    const tire=coat(0x242726),hub=coat(0xb7c2c2),dark=coat(0x25343a);
    const glass=new T.MeshPhongMaterial({color:0x36556c,specular:0xa6bccb,shininess:64,side:T.DoubleSide});
    const white=coat(0xe3e8de),navy=coat(0x15334f),blue=coat(0x328fc0),lightBlue=coat(0x81cfe2);
    const interior=coat(0x545b61),pole=coat(0xdaba63);
    const whiteLamp=new T.MeshBasicMaterial({color:0xffe9bf});
    const redLamp=new T.MeshBasicMaterial({color:0xcf493b});
    const amberLamp=new T.MeshBasicMaterial({color:0xf0a143});
    const brakeLamp=new T.MeshBasicMaterial({color:0xff381c,toneMapped:false});
    const signs=new Map();
    function textSign(label,width,height,background,color) {
      if(!signs.has(label)) signs.set(label,signTexture(label,background,color));
      return new T.Mesh(new T.PlaneGeometry(width,height),signs.get(label));
    }

    function wheel(group,x,z,bus) {
      const radius=bus?.49:.325, width=bus?.25:.20;
      cylinder(group,radius,radius,width,x,radius,z,tire,bus?16:12).rotation.z=Math.PI/2;
      cylinder(group,radius*.54,radius*.54,width+.017,x,radius,z,hub,12).rotation.z=Math.PI/2;
    }

    const finishes=[0xa5493e,0xc8b6a1,0x5c7688,0xa9bdb8,0x373f4d,0xd2c5ac,0x6e846f,0xa77950]
      .map(color=>new T.MeshPhongMaterial({color,specular:0x9ca4ac,shininess:34,side:T.DoubleSide}));
    const sedans=finishes.map((finish,index)=>{
      const group=new T.Group(),utility=index%3===2;
      const length=utility?4.79:4.46,nose=length/2;
      group.add(shell([[-nose,.77,.36,.72],[-nose+.22,.90,.32,.86],[-1.27,.94,.35,.89],
        [.77,.94,.35,.87],[nose-.25,.88,.34,.78],[nose,.77,.38,.69]],finish));
      const top=utility?1.69:1.43;
      group.add(shell([[-1.31,.85,.78,.90],[utility?-1.19:-.72,.74,.87,top-.10],
        [utility?-.95:-.46,.72,.93,top],[.43,.71,.93,top],[.96,.79,.86,.95]],glass));
      group.add(shell([[utility?-1.13:-.63,.69,top-.11,top-.08],[utility?-.95:-.46,.70,top-.03,top+.025],
        [.43,.69,top-.03,top+.022],[.56,.64,top-.09,top-.06]],finish));
      box(group,1.39,.097,.074,0,.48,-nose+.007,tire);
      box(group,.35,.134,.036,0,.622,-nose-.026,white);
      box(group,.92,.126,.054,0,.629,nose+.013,dark);
      for(const bar of [-.032,.022]) box(group,.86,.014,.009,0,.63+bar,nose+.040,hub);
      for(const sign of [-1,1]) {
        wheel(group,sign*.86,-1.34,false);
        wheel(group,sign*.86,1.29,false);
        box(group,.32,.09,.049,sign*.60,.687,nose-.014,whiteLamp);
        box(group,.35,.096,.049,sign*.58,.705,-nose+.014,redLamp);
        box(group,.16,.105,.26,sign*.86,1.03,.48,finish);
        box(group,.12,.37,.07,sign*.73,1.17,-.20,dark);
        box(group,.019,.071,.23,sign*.943,.789,-.23,dark);
      }
      mergeLandmark(group);
      return {group,length};
    });

    function car(index) {
      const {group,length}=sedans[index%sedans.length];
      const body=group.clone();
      const brakeLights=new T.Group();
      for(const side of [-1,1]) box(brakeLights,.32,.064,.058,side*.58,.704,-length/2+.003,brakeLamp);
      body.add(brakeLights);
      scene.add(body);
      return {body,brakeLights,length};
    }

    function bus(direction) {
      const doors=[];
      function section(front) {
        const group=new T.Group(),frame=new T.Group();
        group.add(frame);
        const back=front?-5.17:-3.74, nose=front?5.02:3.12;
        box(frame,2.42,.12,nose-back,0,.48,(nose+back)/2,interior);
        frame.add(shell([[back,.99,2.66,3.01],[back+.16,1.265,2.54,3.15],
          [nose-.20,1.265,2.54,3.15],[nose,1.065,2.66,3.01]],white));
        box(frame,1.76,.33,front?3.69:2.14,0,3.237,front?-1.2:-.54,navy);
        for(let i=0;i<6;i++) box(frame,.076,.045,front?3.48:1.9,-.52+i*.208,3.423,front?-1.2:-.54,hub);
        for(const side of [-1,1]) {
          const openings=side<0?(front?[-2.65,3.67]:[]):(front?[-2.80,3.70]:[-1.17]);
          let start=back+.08;
          const z0=front?4.74:3.08;
          box(frame,.145,.13,z0-start,side*1.195,2.615,(z0+start)/2,navy);
          const strip=(begin,end)=>{
            if(end-begin<.04) return;
            const center=(begin+end)/2,length=end-begin;
            box(frame,.099,.60,length,side*1.218,.780,center,white);
            box(frame,.107,.19,length,side*1.219,1.149,center,lightBlue);
            box(frame,.103,.19,length,side*1.22,1.34,center,navy);
            box(frame,.092,1.032,length,side*1.218,1.941,center,glass);
            box(frame,.102,.18,length,side*1.22,2.54,center,navy);
            const bays=Math.ceil(length/1.54);
            for(let window=0;window<=bays;window++) box(frame,.145,1.04,.074,side*1.21,1.94,begin+length*window/bays,dark);
            box(frame,.059,.045,length,side*1.27,2.36,center,lightBlue);
          };
          for(const opening of openings) {
            strip(start,opening-.62);
            start=opening+.62;
            box(frame,.39,.074,1.24,side*1.06,.49,opening,hub);
            box(frame,.12,.14,1.26,side*1.23,2.55,opening,navy);
            cylinder(frame,.022,.022,1.86,side*.93,1.43,opening-.50,pole,6);
            for(const slide of [-1,1]) {
              const leaf=new T.Group();
              const position=opening+slide*.302;
              leaf.position.set(side*1.233,0,position);
              box(leaf,.083,1.98,.589,0,1.51,0,dark);
              box(leaf,.089,1.45,.43,side*.012,1.73,0,glass);
              box(leaf,.092,.05,.39,side*.017,1.12,0,lightBlue);
              mergeLandmark(leaf);
              doors.push({leaf,position,slide,platform:side<0});
              group.add(leaf);
            }
          }
          strip(start,z0);
          const mid=front?.15:1.34;
          box(frame,.106,.27,front?3.95:2.80,side*1.22,.995,mid,blue);
          for(const axle of front?[-3.73,2.16]:[-2.16]) {
            box(frame,.094,.109,1.13,side*1.231,.949,axle,navy);
            wheel(frame,side*1.218,axle,true);
          }
          box(frame,.08,.091,.16,side*1.273,.80,nose-.44,amberLamp);
          if(front) {
            box(frame,.49,.082,.082,side*1.21,2.24,4.98,navy);
            box(frame,.189,.39,.28,side*1.43,2.11,4.99,navy);
          }
        }
        if(front) {
          box(frame,2.33,.826,.235,0,.938,4.90,blue);
          box(frame,2.24,1.27,.17,0,1.94,4.98,glass);
          box(frame,2.26,.367,.15,0,2.685,4.925,navy);
          for(const side of [-1,1]) {
            box(frame,.102,1.38,.13,side*1.103,1.91,5.015,navy);
            box(frame,.40,.12,.10,side*.81,.78,5.054,whiteLamp);
            box(frame,.31,.121,.055,side*.86,.598,5.062,amberLamp);
          }
        } else {
          box(frame,2.43,2.13,.14,0,1.546,-3.68,navy);
          box(frame,1.78,.93,.085,0,1.88,-3.782,glass);
          box(frame,1.93,.47,.10,0,.783,-3.784,blue);
          for(const side of [-1,1]) box(frame,.19,.48,.075,side*1.01,.87,-3.823,redLamp);
        }
        mergeLandmark(frame);
        for(const side of [-1,1]) {
          const sign=textSign(front?'METRO RAPID':'ELECTRIC',front?3.69:2.36,.34,null,'#f8fbf8');
          sign.position.set(side*1.283,1.00,front?.15:1.37);
          sign.rotation.y=side*Math.PI/2;
          group.add(sign);
        }
        const name=direction>0?'A  SUN PRAIRIE':'A  JUNCTION';
        const display=textSign(front?name:'A',front?1.92:.64,.28,'#171e23','#ffc765');
        display.position.set(0,front?2.70:2.50,front?5.009:-3.79);
        if(!front) display.rotation.y=Math.PI;
        group.add(display);
        scene.add(group);
        return group;
      }
      const body=section(true),trailer=section(false);
      const bellows=new T.Group();
      box(bellows,2.24,2.48,1.13,0,1.77,0,dark);
      for(let rib=0;rib<8;rib++) box(bellows,2.32,2.53,.039,0,1.77,-.54+rib*.154,tire);
      mergeLandmark(bellows);
      scene.add(bellows);
      const brakeLights=new T.Group();
      for(const side of [-1,1]) box(brakeLights,.158,.40,.077,side*1.01,.87,-3.83,brakeLamp);
      trailer.add(brakeLights);
      return {body,trailer,bellows,doors,brakeLights,length:18.30};
    }

    return {bus,car};
  }

  function create(scene,geo,layout) {
    const routes=trafficRoutes(geo.data.roads,layout);
    const models=vehicleModels(scene,geo);
    const rng=geo.random(421433);
    let model=0,lastTime;
    for(const route of routes) {
      const bus=route.kind==='bus';
      const paterson=route.stations.find(stop=>stop.name==='Paterson');
      const offsets=bus?(route.direction>0?[.16,.48,.84]:[.13,.54,.89]):
        route.kind==='outer'?[.07,.20,.31,.43,.55,.65,.77,.87,.94]:[.11,.262,.38,.49,.58,.73,.80,.96];
      for(let slot=0;slot<offsets.length;slot++) {
        const actor=bus?models.bus(route.direction):models.car(model++);
        const docked=bus && slot===1 && route.direction>0 && paterson;
        const target=bus && slot===1 && paterson?paterson.s-(docked?0:56):route.line.length*offsets[slot];
        const stop=route.stations.findIndex(marker=>marker.s>=target-.015);
        const cruise=bus?11.7+rng()*2.5:12.2+rng()*3.7;
        const dwellTime=docked?10.4:6.3+rng()*2.7;
        route.vehicles.push({...actor,bus,s:target,stop:stop<0?route.stations.length:stop,cruise,
          speed:docked?0:cruise*(.59+rng()*.29),dwell:docked?dwellTime:0,dwellTime,braking:Boolean(docked)});
      }
    }
    const canvas=document.createElement('canvas');
    canvas.width=64; canvas.height=64;
    const ink=canvas.getContext('2d');
    const fade=ink.createRadialGradient(32,32,0,32,32,32);
    fade.addColorStop(0,'#191b20b5');
    fade.addColorStop(.68,'#191b2077');
    fade.addColorStop(1,'#191b2000');
    ink.fillStyle=fade;
    ink.fillRect(0,0,64,64);
    const map=new T.CanvasTexture(canvas);
    const shadows=new T.InstancedMesh(new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),
      new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),
      Math.max(1,routes.reduce((sum,route)=>sum+route.vehicles.length*(route.kind==='bus'?2:1),0)));
    shadows.frustumCulled=false;
    shadows.count=0;
    scene.add(shadows);
    const shadow=new T.Object3D(),blockers=[],buses=[];

    function place(group,line,s,width,length,shadowCount) {
      const [x,z,dx,dz]=line.sample(s);
      const [ax,az]=line.sample(s-2.4),[bx,bz]=line.sample(s+2.4);
      const slope=Math.atan2(geo.ground(bx,bz)-geo.ground(ax,az),Math.hypot(bx-ax,bz-az));
      const ux=bx-ax,uz=bz-az,d=Math.hypot(ux,uz);
      const yaw=Math.atan2(d>0?ux:dx,d>0?uz:dz),y=geo.ground(x,z);
      group.position.set(x,y+.246,z);
      group.rotation.set(-slope,yaw,0,'YXZ');
      blockers.push([x,z,Math.sin(yaw),Math.cos(yaw),width/2,length/2]);
      shadow.position.set(x,y+.293,z);
      shadow.rotation.set(-slope,yaw,0,'YXZ');
      shadow.scale.set(width*1.56,1,length*1.20);
      shadow.updateMatrix();
      shadows.setMatrixAt(shadowCount,shadow.matrix);
    }

    function update(time,camera,player) {
      const elapsed=lastTime===undefined?0:Math.min(.25,Math.max(0,time-lastTime));
      lastTime=time;
      const steps=Math.ceil(elapsed*30);
      blockers.length=0;
      buses.length=0;
      let shadowCount=0;
      for(const route of routes) {
        const {line,vehicles}=route;
        const occupied=player?line.project(player[0],player[1]):null;
        for(let step=0;step<steps;step++) updateRoute(route,elapsed/steps,time-elapsed*(1-(step+1)/steps),occupied);
        for(const actor of vehicles) {
          const [x,z,dx,dz]=line.sample(actor.s-(actor.bus?8:0));
          if(actor.bus) buses.push([x,z,dx,dz,actor.dwell>0]);
          const within=Math.hypot(x-camera.position.x,z-camera.position.z)<(actor.bus?680:490);
          actor.body.visible=within;
          if(actor.bus) actor.trailer.visible=actor.bellows.visible=within;
          if(!within) continue;
          actor.brakeLights.visible=actor.braking;
          if(actor.bus) {
            place(actor.body,line,actor.s-5.02,2.63,10.15,shadowCount++);
            place(actor.trailer,line,actor.s-14.40,2.63,6.88,shadowCount++);
            const [jx,jz,jdx,jdz]=line.sample(actor.s-10.71);
            actor.bellows.position.set(jx,geo.ground(jx,jz)+.248,jz);
            actor.bellows.rotation.y=Math.atan2(jdx,jdz);
            const open=geo.clamp(Math.min(actor.dwell/1.05,(actor.dwellTime-actor.dwell)/.96),0,1);
            for(const {leaf,platform,position,slide} of actor.doors) leaf.position.z=position+(platform?slide*.58*open:0);
          } else {
            place(actor.body,line,actor.s-actor.length*.5,1.88,actor.length,shadowCount++);
          }
        }
      }
      shadows.count=shadowCount;
      shadows.instanceMatrix.needsUpdate=true;
    }

    function blocked(x,z,radius) {
      for(const [px,pz,dx,dz,w,l] of blockers) {
        const vx=x-px,vz=z-pz;
        if(Math.abs(vx)>l+radius+1 || Math.abs(vz)>l+radius+1) continue;
        const side=Math.max(0,Math.abs(vx*dz-vz*dx)-w),along=Math.max(0,Math.abs(vx*dx+vz*dz)-l);
        if(side*side+along*along<radius*radius) return true;
      }
      return false;
    }
    return {update,blocked,buses};
  }

  window.MadisonTraffic={cycle,green,yellow,create};
})();
