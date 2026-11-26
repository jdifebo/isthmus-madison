(() => {
  'use strict';

  const $=id=>document.getElementById(id);
  const game=$('game'), map=$('map');
  const data=window.MADISON, world=window.MadisonWorld;
  const points=[
    {name:'Capitol Square', x:-151, z:-4, yaw:Math.PI/2, pitch:.19},
    {name:'State Street', x:-474, z:-11, yaw:Math.PI/2},
    {name:'Memorial Union', x:-1234, z:-157, yaw:-.75},
    {...MadisonCampaign.sites.union,above:29,flyPitch:-.43},
    {name:'Monona Terrace', x:238, z:229, yaw:2.35},
    {name:'James Madison Park', x:135, z:-777, yaw:-.65},
    {name:'East Washington Avenue', x:806, z:-775, yaw:-2.35},
    {name:'Orton Park', x:1718, z:-644, yaw:1.95, pitch:-.035, above:55, marker:[1711,-701]},
    {name:'Breese Stevens Field', x:839, z:-886, yaw:.73, above:78, flyPitch:-.56, marker:[899,-967]}
  ];
  const stationPoints=[];
  const query=new URLSearchParams(window.location.search);
  const watchQuery=query.get('watch');
  const marketDay=query.get('market')==='1';
  const storyMode=!marketDay && query.get('story')==='1';
  let storage;
  try { storage=window.localStorage; } catch {}
  const campaign=MadisonCampaign.open(storage);
  let story,cityUI,citySound;
  const marketBasket=new Set();
  const stallDialog=$('stall-dialog'),transitDialog=$('transit-dialog');
  const stopQuery=query.get('stop')?.toLowerCase();
  let openingStop,firstRide;
  const flyover={name:'Lake Monona',x:497,z:753,yaw:-.59,pitch:-.24,above:164};
  const modeNames={walk:'WALKING',drive:'DRIVING',fly:'FLYING',ride:'RIDING'};
  const travelModes=['walk','drive','fly'];
  const modeKeys={Digit1:'walk',Digit2:'drive',Digit3:'fly'};
  const worldBounds=data.bounds;
  const keys=new Set();
  const remap={ArrowUp:'KeyW',ArrowDown:'KeyS',ArrowLeft:'KeyA',ArrowRight:'KeyD'};
  const lightNames=['Daylight','Golden hour','Blue hour'];
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(n,min,max)=>Math.max(min,Math.min(n,max));
  const smooth=(from,to,rate,dt)=>from+(to-from)*(1-Math.exp(-rate*dt));
  let engine, state='intro', focus=points[0], light=marketDay?0:1, expanded=false, toastTimer;
  let x=focus.x,z=focus.z,yaw=focus.yaw,pitch=-.035,speed=0,steer=0,walkTime=0,walkAmount=0;
  let altitude=0, airX=0, airY=0, airZ=0, groundReturn=points[0];
  let pointer=null, previous=0, lastHUD=-1, lastRender=0, snap=true;
  let rideView=null,rideLook=0,stopRequested=false;
  let seated=false;
  const fieldMap=MadisonFieldMap.create(map,data,storage);
  const roadText=road=>road.name.replace(/\b(North|South|East|West)\b/g,word=>word[0]+'.');
  const carSave='isthmus-parked-car-v1';
  const carName='Your parked car';
  let navigation,manualTarget=null,gpsCache=null,parkedCar=null,boardingStop=null;
  const player=()=>({x,z,yaw,mode:state,flying:state==='fly'});

  function loadStationPoints() {
    for(const [name,x,z,,,info] of engine.platforms) {
      const stationId=info?.id || name.toLowerCase();
      const direction=info?.direction>0?'Eastbound':'Westbound';
      const nameWithDirection=name+' BRT'+(info?.curb?' · '+direction:'')+(info?.detour?' detour':'');
      const platform=engine.transit.platformStart(stationId);
      const view=info?.curb?platform:{x:x+4.25,z:z+18.25,yaw:-.23};
      stationPoints.push({...view,name:nameWithDirection,stationId,above:43,transit:true,marker:[x,z]});
    }
    points.push(...stationPoints);
    openingStop=stationPoints.find(point=>point.stationId===stopQuery);
    firstRide=stationPoints.find(point=>point.stationId==='state-east') || stationPoints.find(point=>point.stationId==='paterson') || stationPoints[0];
  }

  function destination() {
    if(state==='intro') return manualTarget;
    if(manualTarget || story?.target()) return manualTarget || story.target();
    if(story?.tracked()?.needsRide && state!=='ride') {
      const origin=stationPoints.filter(point=>engine.transit.services(point.stationId).length)
        .reduce((best,point)=>!best || Math.hypot(point.x-x,point.z-z)<Math.hypot(best.x-x,best.z-z)?point:best,null);
      return origin;
    }
    return null;
  }

  function gps(target) {
    if(!target || !navigation || state==='ride' || state==='fly') return null;
    const mode=state==='drive'?'drive':'walk';
    if(gpsCache?.target===target && gpsCache.mode===mode && Math.hypot(x-gpsCache.x,z-gpsCache.z)<17) return gpsCache.route;
    const route=navigation.plan({x,z},target,mode);
    gpsCache={target,mode,x,z,route};
    return route;
  }

  function drawMap() {
    const target=destination(),route=gps(target);
    fieldMap.draw({player:player(),target,route,points:points.map(point=>{
      const [x,z]=point.marker || [point.x,point.z];
      return {x,z,transit:point.transit};
    }),buses:engine?.buses || [],car:story && state!=='drive'?parkedCar:null,activity:cityUI?.read()});
    if(expanded) cityUI?.mapRows(target);
    const meters=target?route?.distance ?? Math.hypot(x-target.x,z-target.z):0;
    const length=meters>=1000?(meters/1000).toFixed(1)+' km':Math.round(meters)+' m';
    $('map-destination').textContent=target?.name || 'No destination';
    $('map-directions').textContent=target?
      (route?.hint || (state==='ride' || state==='fly'?'Distance to destination':'No connected route from here'))+' · '+length:
      'Choose a place or objective.';
    $('map-clear').hidden=!manualTarget;
    $('map-find-car').hidden=!story || !parkedCar || state==='drive';
    $('gps-hint').hidden=!route || state==='intro';
    if(route) $('gps-hint').textContent=(manualTarget?manualTarget.name+' · ':'')+route.hint;
  }

  function mapButton(label,action) {
    const button=document.createElement('button');
    button.type='button';
    button.textContent=label;
    button.addEventListener('click',action);
    return button;
  }

  function showObjectives() {
    const rows=story?.objectives() || [];
    $('map-objectives').hidden=!rows.length;
    $('map-objective-list').replaceChildren(...rows.map(row=>{
      const button=mapButton(row.title,()=>{
        if(!story.track(row.key)) return;
        manualTarget=null;
        showObjectives();
        fieldMap.open(true,player(),destination());
        drawMap();
      });
      button.setAttribute('aria-current',String(story.tracked()?.key===row.key));
      return button;
    }));
  }

  function guide(point) {
    manualTarget=point;
    if(expanded) fieldMap.open(true,player(),destination());
    drawMap();
  }

  function setMap(open) {
    expanded=open;
    $('map-card').classList.toggle('expanded',open);
    game.classList.toggle('map-open',open);
    $('map-toggle').setAttribute('aria-expanded',String(open));
    for(const id of ['map-close','map-details','map-tools']) $(id).hidden=!open;
    for(const id of ['hud','intro','city-watch']) $(id).inert=open;
    game.querySelector('.rail').inert=open;
    game.querySelector('.credits').inert=open;
    keys.clear();
    pointer=null;
    fieldMap.open(open,player(),destination());
    if(open) {
      $('help').hidden=true;
      $('help-toggle').setAttribute('aria-expanded','false');
      showObjectives();
      $('map-close').focus();
      cityUI?.mapRows(destination(),true);
    }
    drawMap();
  }

  function toast(message) {
    $('toast').textContent=message;
    $('toast').hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{$('toast').hidden=true;},2400);
  }

  function setTime(next) {
    light=next;
    engine.setLight(light);
    $('light-label').textContent=lightNames[light];
  }

  function storyNearby() {
    return state==='walk' && !seated && !engine.transit.platformAt(x,z)?campaign.nearby(x,z):null;
  }

  function cityOffer() {
    if(state!=='walk' || seated || engine.transit.platformAt(x,z) || engine.market?.nearby(x,z) || story && storyNearby()) return null;
    return engine.city.nearby(x,z);
  }

  function cityInteract() {
    if(!cityOffer()) return;
    cityUI.notify(engine.city.act(x,z));
    updateHUD();
  }

  function storyStart() {
    const {last,hasSave}=campaign.view();
    return hasSave?MadisonCampaign.sites[last]:MadisonCampaign.arrival;
  }

  function storyInteract() {
    if(seated) {
      seated=false;
      snap=true;
      updateHUD();
    } else story.openEncounter();
  }

  function heading(dx,dz) {
    return Math.atan2(dx,-dz);
  }

  function carAllowed(cx,cz,angle,ignoreCar=false) {
    const dx=Math.sin(angle), dz=-Math.cos(angle);
    const blocked=(x,z,radius)=>groundBlocked(x,z,radius,ignoreCar)
      || engine.market?.drivingBlocked(x,z,radius) || engine.city.blocksCar(x,z);
    return !blocked(cx,cz,1) && !blocked(cx+dx*1.42,cz+dz*1.42,.93)
      && !blocked(cx-dx*1.42,cz-dz*1.42,.93);
  }

  function groundBlocked(x,z,radius,ignoreCar=false) {
    return world.blocked(x,z,radius) || engine.trafficBlocked(x,z,radius) || engine.parking.collision(x,z,radius)
      || engine.market?.blocked(x,z,radius) || !ignoreCar && parkedCar && state!=='drive' && MadisonParking.overlaps(parkedCar,x,z,radius);
  }

  function keepCar(point) {
    parkedCar={name:carName,x:point.x,z:point.z,yaw:point.yaw};
    if(manualTarget?.name===carName) manualTarget=parkedCar;
    try { storage?.setItem(carSave,JSON.stringify(parkedCar)); } catch {}
  }

  function curbNear(point) {
    return engine.parking.nearest(point.x,point.z,slot=>{
      if(!carAllowed(slot.x,slot.z,slot.yaw,true)) return false;
      for(const side of [1,-1]) {
        const dx=Math.cos(slot.yaw)*2.2*side,dz=Math.sin(slot.yaw)*2.2*side;
        if(!groundBlocked(slot.x+dx,slot.z+dz,.4,true)) return true;
      }
      return false;
    });
  }

  function restoreCar() {
    let stored;
    try { stored=JSON.parse(storage?.getItem(carSave)); } catch {}
    if(stored && [stored.x,stored.z,stored.yaw].every(Number.isFinite) && carAllowed(stored.x,stored.z,stored.yaw,true)) keepCar(stored);
    else {
      const slot=curbNear(storyStart()) || curbNear(points[0]);
      if(slot) keepCar(slot);
    }
  }

  function carNear() {
    return parkedCar && Math.hypot(x-parkedCar.x,z-parkedCar.z)<5;
  }

  function enterCar() {
    if(!parkedCar) return;
    if(state!=='walk' || seated || !carNear()) {
      guide(parkedCar);
      toast('Follow the route to your parked car.');
      return;
    }
    if(engine.trafficBlocked(parkedCar.x,parkedCar.z,1)) { toast('Wait for traffic to clear.'); return; }
    if(manualTarget===parkedCar) manualTarget=null;
    changeMode('drive',parkedCar);
  }

  function leaveCar() {
    if(Math.abs(speed)>1.25) { toast('Brake to a stop before getting out.'); return false; }
    for(const side of [1,-1]) {
      const px=x+Math.cos(yaw)*2.15*side,pz=z+Math.sin(yaw)*2.15*side;
      if(groundBlocked(px,pz,.4,true)) continue;
      keepCar({x,z,yaw});
      changeMode('walk',{name:carName,x:px,z:pz,yaw});
      return true;
    }
    toast('Leave a little room on either side of the car.');
    return false;
  }

  function recallCar(site) {
    if(!parkedCar || Math.hypot(parkedCar.x-site.x,parkedCar.z-site.z)<160) return false;
    const curb=curbNear(site);
    if(!curb) return false;
    keepCar(curb);
    return true;
  }

  function driveSpawn() {
    const road=world.nearestRoad(x,z,true);
    if (road && road.distance<66) {
      const dx=road.bx-road.ax,dz=road.bz-road.az;
      const t=clamp(((x-road.ax)*dx+(z-road.az)*dz)/(dx*dx+dz*dz),.04,.96);
      let angle=heading(dx,dz);
      if (Math.cos(angle-yaw)<0) angle+=Math.PI;
      const rightX=Math.cos(angle),rightZ=Math.sin(angle);
      for (const offset of [Math.min(1.5,road.width*.17),0,-1.4]) {
        const cx=road.ax+t*dx+rightX*offset, cz=road.az+t*dz+rightZ*offset;
        if (carAllowed(cx,cz,angle)) { x=cx; z=cz; yaw=angle; return; }
      }
    }
    if (carAllowed(x,z,yaw)) return;
    for (let radius=3;radius<20;radius+=3) {
      for (let i=0;i<12;i++) {
        const angle=i*Math.PI/6, cx=x+radius*Math.sin(angle), cz=z-radius*Math.cos(angle);
        if (carAllowed(cx,cz,yaw)) { x=cx; z=cz; return; }
      }
    }
    x=marketDay?230:-133; z=marketDay?-213:28; yaw=Math.PI/4;
  }

  function safeDrop(point,range=45) {
    if (!groundBlocked(point.x,point.z,.4)) return point;
    for(let radius=2;radius<=range;radius+=2) {
      for(let i=0;i<16;i++) {
        const angle=i*Math.PI/8, cx=point.x+Math.sin(angle)*radius, cz=point.z+Math.cos(angle)*radius;
        if (!groundBlocked(cx,cz,.4)) return {...point,x:cx,z:cz};
      }
    }
    return null;
  }

  function changeMode(next,point) {
    if (!engine) return;
    seated=false;
    const previousMode=state;
    if(previousMode==='ride' && next!=='ride') {
      engine.transit.release();
      rideView=null;
      stopRequested=false;
    }
    let landedAway=false;
    if(point) {
      focus=point;
      const destination=next==='fly' || next==='drive' && storyMode?point:(safeDrop(point) || points[0]);
      ({x,z,yaw}=destination);
      pitch=point.pitch ?? -.026;
      if(next==='fly') pitch=point===flyover?point.pitch:point.flyPitch ?? -.34;
    } else if(previousMode==='fly' && next!=='intro') {
      const landing=safeDrop({x,z,yaw},34);
      landedAway=!landing;
      ({x,z,yaw}=landing || groundReturn);
      pitch=-.035;
    } else if(previousMode==='drive' && next==='walk') {
      for(const side of [1,-1]) {
        const px=x+Math.cos(yaw)*2.3*side, pz=z+Math.sin(yaw)*2.3*side;
        if(!groundBlocked(px,pz,.4)) { x=px; z=pz; break; }
      }
    }
    state=next;
    if(next==='fly') {
      if(previousMode!=='fly' && previousMode!=='intro') groundReturn={x,z,yaw};
      altitude=Math.min(640,Math.max(world.flightFloor(x,z),world.ground(x,z)+(point?.above ?? (point?112:35))));
    } else if(next!=='intro') {
      groundReturn={x,z,yaw};
    }
    if(next==='drive' && !storyMode) driveSpawn();
    speed=steer=walkAmount=airX=airY=airZ=0;
    keys.clear();
    snap=true;
    game.classList.toggle('playing',next!=='intro');
    game.classList.toggle('driving',next==='drive');
    game.classList.toggle('flying',next==='fly');
    game.classList.toggle('riding',next==='ride');
    game.classList.remove('hud-free');
    $('intro').hidden=next!=='intro';
    $('hud').hidden=next==='intro';
    $('city-toggle').hidden=next==='intro';
    $('help').hidden=true;
    $('help-toggle').setAttribute('aria-expanded','false');
    $('speedometer').hidden=next!=='drive';
    $('altimeter').hidden=next!=='fly';
    $('mode-label').lastChild.textContent=' '+(modeNames[next] || modeNames.walk);
    $('motion-label').textContent={walk:'Move',drive:'Steer',fly:'Fly'}[next] || 'Move';
    $('look-tip').textContent=next==='drive'?'Space to brake':'Drag to look';
    for(const mode of travelModes) $('mode-'+mode).setAttribute('aria-pressed',String(mode===next));
    engine.car.visible=next==='drive' || storyMode && Boolean(parkedCar) && next!=='intro';
    setMap(false);
    updateHUD();
    if(landedAway) toast('Returned to your last ground position.');
  }

  function visitPlatform(point) {
    const platform=engine.transit.platformStart(point.stationId);
    changeMode('walk',platform?{...point,...platform,name:point.name}:point);
  }

  function stepOff() {
    const platform=engine.transit.exit();
    if(platform) arriveByBus(platform);
  }

  function arriveByBus(platform,express=false) {
    const station=stationPoints.find(point=>point.stationId===platform.id);
    changeMode('walk',{...station,...platform,name:station?.name || platform.name});
    const stamp=story && campaign.recordTransit(boardingStop,platform.id);
    boardingStop=null;
    if(stamp) { manualTarget=null;story.refresh();updateHUD(); }
    toast((express?'Express arrival · ':'Stepped off at ')+platform.name+(stamp?' · Route A card stamped':'')+'.');
  }

  function startRide(origin,direction=null) {
    const boarded=direction===null?engine.transit.board(x,z):engine.transit.summon(origin,direction);
    if(!boarded) { toast('No coach is available here.');return; }
    boardingStop=origin;
    rideView=engine.transit.ride();
    rideLook=.10;
    pitch=-.025;
    stopRequested=false;
    changeMode('ride');
  }

  function transitMenu() {
    const onBus=state==='ride',platform=state==='walk'?engine.transit.platformAt(x,z):null;
    if(!onBus && !platform) return;
    setMap(false);
    $('transit-title').textContent=onBus?'Express to a stop':platform.name;
    const choices=$('transit-choices');
    choices.replaceChildren();
    function add(title,action) {
      const entry=mapButton(title,()=>{transitDialog.close();action();});
      entry.className='glass small';
      choices.append(entry);
    }
    if(onBus) {
      for(const stop of engine.transit.destinations()) add(stop.name,()=>{
        const arrival=engine.transit.express(stop.id);
        if(arrival) arriveByBus(arrival,true);
      });
    } else {
      const waiting=engine.transit.stationStatus(x,z);
      if(waiting?.boarding) add('Board the waiting bus',()=>startRide(platform.id));
      for(const service of engine.transit.services(platform.id)) {
        add('Summon '+(service.direction>0?'eastbound':'westbound')+' · '+service.end,()=>startRide(platform.id,service.direction));
      }
    }
    const note=document.createElement('p');
    note.textContent=onBus?'Choose a stop ahead for an instant arrival. Close this menu to continue the ride.':
      choices.children.length?'Ride along or choose an express stop once aboard.':'This platform is an arrival terminus. Follow the map to a departing platform.';
    choices.append(note);
    transitDialog.showModal();
  }

  function busAction() {
    if(state==='ride') {
      if(rideView?.open) stepOff();
      else {
        stopRequested=!stopRequested;
        updateTransitPanel();
      }
      return;
    }
    if(state==='walk') transitMenu();
  }

  function updateTransitPanel() {
    const waiting=state==='walk'?engine.transit.stationStatus(x,z):null;
    const riding=state==='ride'?rideView:null;
    const direction=riding?.direction || waiting?.direction;
    const panel=$('transit-panel'),button=$('transit-action');
    panel.hidden=!riding&&!waiting;
    $('transit-destinations').hidden=!riding || !engine.transit.destinations().length;
    if(panel.hidden) return;
    let action,status;
    if(riding) {
      action=riding.open?'Step off':stopRequested?'Cancel request':'Request stop';
      if(riding.open) status='Doors open at '+riding.station;
      else if(stopRequested) status='Stop requested for '+riding.next;
      else if(riding.station) status='At '+riding.station;
      else status='Next stop · '+riding.next;
      if(riding.riders) status+=' · '+riding.riders+(riding.riders===1?' rider':' riders');
    } else {
      action='Travel';
      status=waiting.boarding?'Doors open at '+waiting.name:waiting.name+' platform';
      if(waiting.waiting) status+=' · '+waiting.waiting+' waiting';
    }
    const labels={'transit-status':status,'transit-route':direction?'Route A · '+direction:'Route A','transit-action-label':action};
    for(const [id,label] of Object.entries(labels)) {
      const element=$(id);
      if(element.textContent!==label) element.textContent=label;
    }
    button.hidden=!action;
  }

  function fly(dt) {
    const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
    const side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    const vertical=Number(keys.has('Space'))-Number(keys.has('KeyC'));
    const boost=keys.has('ShiftLeft') || keys.has('ShiftRight');
    const rate=(boost?114:43)/Math.max(1,Math.hypot(forward,side));
    const turns=Math.sin(yaw), northward=Math.cos(yaw);
    airX=smooth(airX,rate*(turns*forward+northward*side),5.3,dt);
    airZ=smooth(airZ,rate*(-northward*forward+turns*side),5.3,dt);
    airY=smooth(airY,vertical*(boost?63:27),6,dt);
    const [west,north,east,south]=worldBounds;
    altitude=clamp(altitude+airY*dt,world.flightFloor(x,z),640);
    const steps=Math.max(1,Math.ceil(Math.hypot(airX,airZ)*dt/2.2));
    for(let step=0;step<steps;step++) {
      const nx=clamp(x+airX*dt/steps,west+7,east-7);
      const nz=clamp(z+airZ*dt/steps,north+7,south-7);
      if(altitude>=world.flightFloor(nx,nz)) { x=nx; z=nz; }
      else if(altitude>=world.flightFloor(nx,z)) x=nx;
      else if(altitude>=world.flightFloor(x,nz)) z=nz;
    }
  }

  function walk(dt) {
    const throttle=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
    const side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    const length=Math.hypot(throttle,side);
    walkAmount=smooth(walkAmount,length?1:0,12,dt);
    if(!length) return;
    const sprint=keys.has('ShiftLeft') || keys.has('ShiftRight');
    const step=dt*(sprint?6.6:3.4)/length;
    const dx=(Math.sin(yaw)*throttle+Math.cos(yaw)*side)*step;
    const dz=(-Math.cos(yaw)*throttle+Math.sin(yaw)*side)*step;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.24));
    const sx=dx/steps,sz=dz/steps;
    for(let i=0;i<steps;i++) {
      if(!groundBlocked(x+sx,z+sz,.33)) { x+=sx; z+=sz; }
      else if(!groundBlocked(x+sx,z,.33)) x+=sx;
      else if(!groundBlocked(x,z+sz,.33)) z+=sz;
    }
    walkTime+=dt*(sprint?13.5:10);
  }

  function drive(dt) {
    const gas=keys.has('KeyW'), reverse=keys.has('KeyS'), brake=keys.has('Space');
    const turn=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    const road=world.nearestRoad(x,z,true);
    const onStreet=road && road.distance<road.width/2+.65;
    const limit=onStreet?31:10;
    if(brake || gas && reverse) speed=smooth(speed,0,9,dt);
    else if(gas) speed=Math.min(limit,speed+dt*(speed<0?16:8.5));
    else if(reverse) speed=Math.max(-7.3,speed-dt*(speed>0?19:5.1));
    else speed=smooth(speed,0,onStreet?.50:1.28,dt);
    steer=smooth(steer,turn,10,dt);
    let remaining=dt;
    while(remaining>0) {
      const step=Math.min(remaining,1/100);
      remaining-=step;
      const angle=yaw+steer*Math.sign(speed)*Math.min(Math.abs(speed)/4,1)*mixTurn(speed)*step;
      const nx=x+Math.sin(angle)*speed*step, nz=z-Math.cos(angle)*speed*step;
      if(carAllowed(nx,nz,angle)) { x=nx; z=nz; yaw=angle; }
      else { speed=0; break; }
    }
  }

  function mixTurn(velocity) {
    return 1.81-Math.min(Math.abs(velocity),31)*.031;
  }

  function placeOwnCar(cx,cz,angle) {
    const dx=Math.sin(angle),dz=-Math.cos(angle);
    engine.car.position.set(cx,world.ground(cx,cz)+.235,cz);
    const front=world.ground(cx+dx*1.7,cz+dz*1.7),back=world.ground(cx-dx*1.7,cz-dz*1.7);
    engine.car.rotation.set(Math.atan2(front-back,3.4),-angle,0,'YXZ');
  }

  function setCamera(seconds,dt) {
    const camera=engine.camera;
    if(state==='drive') placeOwnCar(x,z,yaw);
    else if(parkedCar) placeOwnCar(parkedCar.x,parkedCar.z,parkedCar.yaw);
    if(state==='intro') {
      const drift=Math.sin(seconds*.13);
      camera.position.set(480+drift*19,157+Math.sin(seconds*.08)*6,695-drift*17);
      camera.lookAt(-342,37,14);
      return;
    }
    if(state==='ride' && rideView) {
      ({x,z}=rideView);
      yaw=rideView.yaw+rideLook;
      const y=rideView.y;
      camera.position.set(x,y,z);
      camera.lookAt(x+Math.sin(yaw)*Math.cos(pitch),y+Math.sin(pitch),z-Math.cos(yaw)*Math.cos(pitch));
      return;
    }
    const base=world.ground(x,z), dx=Math.sin(yaw), dz=-Math.cos(yaw);
    if(state!=='drive') {
      const bob=walkAmount*(reducedMotion.matches?0:.041)*Math.sin(walkTime);
      const y=state==='fly'?altitude:base+(seated?1.23:1.86)+(engine.transit.platformAt(x,z)?.height || 0);
      camera.position.set(x,state==='fly' || snap?y:smooth(camera.position.y,y+bob,18,dt),z);
      camera.lookAt(x+dx*Math.cos(pitch),camera.position.y+Math.sin(pitch),z+dz*Math.cos(pitch));
    } else {
      const distance=7.7+Math.abs(speed)*.065;
      let cx=x-dx*distance,cz=z-dz*distance;
      if(world.blocked(cx,cz,.15) && !world.onWater(cx,cz)) { cx=x-dx*3.6; cz=z-dz*3.6; }
      const cy=Math.max(world.ground(cx,cz)+2.4,base+3.35);
      camera.position.set(snap?cx:smooth(camera.position.x,cx,7,dt),
        snap?cy:smooth(camera.position.y,cy,10,dt),snap?cz:smooth(camera.position.z,cz,7,dt));
      camera.lookAt(x+dx*5.6,base+1.43,z+dz*5.6);
    }
    snap=false;
  }

  function updateHUD() {
    const road=world.nearestRoad(x,z,false,true);
    const nearby=points.reduce((best,p)=>Math.hypot(x-p.x,z-p.z)<Math.hypot(x-best.x,z-best.z)?p:best,points[0]);
    const distance=Math.hypot(x-nearby.x,z-nearby.z);
    const lake=state==='fly'?world.lakeName(x,z):'';
    const milestone=story && storyNearby();
    const name=lake || (milestone?MadisonCampaign.sites[milestone].name:
      distance<(nearby.transit?53:165)?nearby.name:road?.distance<42?road.name:'Downtown Madison');
    $('place-name').textContent=rideView?'Metro Rapid':name;
    $('location-name').textContent=rideView?(road?.distance<40?roadText(road):'Madison, Wisconsin'):
      road?.distance<34 && name!==road.name?roadText(road):'Madison, Wisconsin';
    $('map-status').textContent=state==='intro'?'Capitol Square':rideView?'Route A · '+(rideView.station || rideView.direction):name;
    $('speed').textContent=String(Math.round(Math.abs(speed)*2.23694));
    $('altitude').textContent=String(Math.round(Math.max(0,altitude-world.ground(x,z))));
    updateTransitPanel();
    const stall=state==='walk' && $('transit-panel').hidden && engine.market?.nearby(x,z);
    $('market-panel').hidden=!stall;
    if(stall && $('market-stall-name').textContent!==stall.name) $('market-stall-name').textContent=stall.name;
    story?.update(x,z,state!=='intro',seated);
    if(story) engine.siteTarget(state==='intro'?null:story.target());
    cityUI?.update(state!=='intro');
    $('car-panel').hidden=!story || state!=='drive' && !(state==='walk' && !seated && carNear()
      && !milestone && $('transit-panel').hidden && $('city-panel').hidden);
    $('car-action-label').textContent=state==='drive'?'Get out':'Get in';
    drawMap();
  }

  function frame(stamp) {
    requestAnimationFrame(frame);
    const dt=Math.min((stamp-(previous || stamp))/1000,.35);
    previous=stamp;
    if(document.hidden || expanded || transitDialog.open) return;
    if(!expanded && $('help').hidden && !stallDialog.open && !story?.modalOpen()) {
      if(state==='walk' && !seated) walk(dt);
      if(state==='drive') drive(dt);
      if(state==='fly') fly(dt);
    }
    if(state==='intro' && stamp-lastRender<32) return;
    let seconds=stamp/1000;
    if(state==='intro' && reducedMotion.matches) seconds=0;
    lastRender=stamp;
    engine.advanceTraffic(state==='intro'?0:seconds,state==='walk' || state==='drive'?[x,z]:null,
      state==='drive'?null:parkedCar,state==='drive');
    if(state==='ride') {
      rideView=engine.transit.ride();
      if(rideView?.open && (stopRequested || rideView.final)) stepOff();
    }
    setCamera(seconds,dt);
    if(stamp-lastHUD>90) {
      lastHUD=stamp;
      updateHUD();
    }
    engine.render(seconds,state==='intro'?null:[x,z,state==='fly'?altitude:0]);
    if(state!=='intro') citySound.update(cityUI.read(),player(),engine.buses,engine.city.time());
  }

  function browseMarket(stall=engine.market?.nearby(x,z)) {
    if(state!=='walk' || !stall) return;
    keys.clear();
    pointer=null;
    $('stall-title').textContent=stall.name;
    const items=$('market-items');
    items.replaceChildren();
    function updateBasket() {
      const count=marketBasket.size;
      $('market-basket').textContent=count?`${count} ${count===1?'item':'items'} in your basket`:'Your basket is empty';
    }
    for(const [name,description] of stall.items) {
      const row=document.createElement('li');
      const details=document.createElement('div');
      const title=document.createElement('h3');
      const copy=document.createElement('p');
      const add=document.createElement('button');
      title.textContent=name;
      copy.textContent=description;
      add.className='glass small';
      add.type='button';
      function updateChoice() {
        const chosen=marketBasket.has(name);
        add.setAttribute('aria-pressed',String(chosen));
        add.setAttribute('aria-label',chosen?'In basket · '+name:'Add to basket · '+name);
        add.textContent=chosen?'In basket':'Add to basket';
      }
      add.addEventListener('click',()=>{
        if(!marketBasket.delete(name)) marketBasket.add(name);
        updateChoice();
        updateBasket();
      });
      updateChoice();
      details.append(title,copy);
      row.append(details,add);
      items.append(row);
    }
    updateBasket();
    stallDialog.showModal();
  }

  function loadingProgress(value,label) {
    $('loading-progress').value=value;
    $('loading-percent').textContent=value+'%';
    $('loading-status').textContent=label+(value<100?'…':'');
  }

  function bind() {
    citySound=MadisonCitySound.create();
    cityUI=MadisonCityUI.create(engine.city,{guide,offer:cityOffer,toast,sound:citySound});
    const walkStart=()=>story?storyStart():engine.market?.start || points[0];
    function returnTitle() {
      if(story && state==='drive' && !leaveCar()) {setMap(false);return;}
      manualTarget=null;
      cityUI.toggle(false);
      changeMode('intro',points[0]);
    }
    $('walk').addEventListener('click',()=>changeMode('walk',walkStart()));
    $('drive').addEventListener('click',()=>{
      if(!story) {changeMode('drive',points[0]);return;}
      changeMode('walk',walkStart());
      enterCar();
    });
    $('fly').addEventListener('click',()=>changeMode('fly',flyover));
    $('ride-start').addEventListener('click',()=>visitPlatform(firstRide));
    $('transit-action').addEventListener('click',busAction);
    $('transit-destinations').addEventListener('click',transitMenu);
    $('transit-close').addEventListener('click',()=>transitDialog.close());
    $('market-browse').addEventListener('click',()=>browseMarket());
    $('market-close').addEventListener('click',()=>stallDialog.close());
    $('encounter-action').addEventListener('click',storyInteract);
    $('car-action').addEventListener('click',()=>state==='drive'?leaveCar():enterCar());
    $('city-action').addEventListener('click',cityInteract);
    $('home').addEventListener('click',returnTitle);
    $('map-home').addEventListener('click',returnTitle);
    if(storyMode) {
      story=MadisonCampaignUI.create(campaign,{
        nearby:storyNearby,
        pause() {
          setMap(false);
          $('help').hidden=true;
          $('help-toggle').setAttribute('aria-expanded','false');
        },
        onAction(result,site) {
          const moved=!result.seat && result.repark && recallCar(site);
          if(!result.seat) manualTarget=null;
          if(result.rest) {
            changeMode('walk',site);
            setTime(1);
          } else {
            if(result.seat) {
              ({x,z,yaw}=result.seat);
              pitch=-.03;
              seated=snap=true;
            }
            updateHUD();
          }
          toast(result.message+(moved?' · Car parked nearby':''));
        },
        onReturn:site=>changeMode('walk',site),
        canReturn:()=>state!=='ride' && state!=='drive',
        onTrack:()=>{manualTarget=null;updateHUD();},
        capture:engine.capture
      });
    }
    const selectMode=mode=>{
      if(mode===state) return;
      if(state==='ride') {
        if(mode==='walk') busAction();
        else toast('Step off at a station to change travel modes.');
        return;
      }
      if(story && mode==='drive') {enterCar();return;}
      if(story && state==='drive') {
        if(mode==='walk') leaveCar();
        else toast('Park and get out before taking flight.');
        return;
      }
      if(state==='drive' && mode==='walk' && Math.abs(speed)>2.3) { toast('Brake before stepping out.'); return; }
      changeMode(mode,state==='intro'?(mode==='fly'?flyover:mode==='walk'?walkStart():points[0]):undefined);
    };
    const reset=()=>{
      if(story && state==='drive') {toast('Park and get out before resetting.');return;}
      if(state!=='intro') { changeMode(state==='ride'?'walk':state,focus); toast('Back at '+focus.name); }
    };
    for(const mode of travelModes) $('mode-'+mode).addEventListener('click',()=>selectMode(mode));
    $('reset').addEventListener('click',reset);
    $('light').addEventListener('click',()=>setTime((light+1)%lightNames.length));
    $('map-toggle').addEventListener('click',()=>setMap(!expanded));
    $('map-close').addEventListener('click',()=>setMap(false));
    $('map-expand').addEventListener('click',()=>setMap(true));
    const orientation=()=>{
      const north=fieldMap.orientation();
      $('map-orientation').textContent=north?'North up':'Heading up';
      $('map-orientation').setAttribute('aria-pressed',String(north));
    };
    orientation();
    $('map-orientation').addEventListener('click',()=>{fieldMap.toggle();orientation();});
    $('map-recenter').addEventListener('click',fieldMap.recenter);
    $('map-plus').addEventListener('click',()=>fieldMap.magnify(1.21));
    $('map-minus').addEventListener('click',()=>fieldMap.magnify(1/1.21));
    $('map-find-car').addEventListener('click',()=>guide(parkedCar));
    $('map-clear').addEventListener('click',()=>guide(null));
    $('help-toggle').addEventListener('click',()=>{
      const open=$('help').hidden;
      if(open) setMap(false);
      $('help').hidden=!open;
      $('help-toggle').setAttribute('aria-expanded',String(open));
      keys.clear();
    });
    $('credits-toggle').addEventListener('click',()=>{
      $('credits').hidden=!$('credits').hidden;
      $('credits-toggle').setAttribute('aria-expanded',String(!$('credits').hidden));
    });
    const mapPlaces=story?[...points,...['books','cheese','studio','workshop'].map(id=>MadisonCampaign.sites[id])]:points;
    for(const point of mapPlaces) {
      const button=mapButton(point.name,()=>{
        if(story) {guide(point);return;}
        const mode=state==='intro' || state==='ride'?'walk':state;
        if(point.transit && mode==='walk') visitPlatform(point);
        else changeMode(mode,point);
      });
      $(point.transit?'map-stops':'landmarks').append(button);
    }
    $('osm-credit').hidden=!data.osm;
    if(data.osm) $('credits-toggle').textContent='© OpenStreetMap · Map credits';
    window.addEventListener('keydown',event=>{
      if(event.altKey || event.ctrlKey || event.metaKey || stallDialog.open || transitDialog.open) return;
      const key=remap[event.code] || event.code;
      if(story && state!=='intro' && !event.repeat && (key==='KeyJ'||key==='KeyI')) {
        if(key==='KeyJ' && story.journalOpen()) story.closeJournal();
        else if(!story.modalOpen() || story.journalOpen()) {
          game.classList.remove('hud-free');
          story.openJournal(key==='KeyI'?'inventory':'quests');
        }
        return;
      }
      if(story?.modalOpen()) return;
      if(event.code==='Escape') {
        if(game.classList.contains('hud-free')) game.classList.remove('hud-free');
        else if(expanded) setMap(false);
        else if(!$('help').hidden) {
          $('help').hidden=true;
          $('help-toggle').setAttribute('aria-expanded','false');
        } else if(!$('credits').hidden) {
          $('credits').hidden=true;
          $('credits-toggle').setAttribute('aria-expanded','false');
        } else if(cityUI.visible()) cityUI.toggle(false);
        else if(state!=='intro') setMap(true);
        return;
      }
      if(event.code==='KeyM' && !event.repeat) { game.classList.remove('hud-free'); setMap(!expanded); return; }
      if(!event.repeat && modeKeys[key] && !expanded) { selectMode(modeKeys[key]); return; }
      if(!event.repeat && key==='KeyF' && !expanded) { selectMode(state==='fly'?'walk':'fly'); return; }
      if(state==='intro' || expanded) return;
      if(key==='KeyL' && !event.repeat) {
        game.classList.remove('hud-free');
        $('help').hidden=true;
        $('help-toggle').setAttribute('aria-expanded','false');
        cityUI.toggle();
        return;
      }
      if(state!=='ride' && ['KeyW','KeyS','KeyA','KeyD','KeyC','Space','ShiftLeft','ShiftRight'].includes(key)) {
        if(key==='Space' && state==='walk') return;
        event.preventDefault();
        keys.add(key);
      }
      if(!event.repeat && key==='KeyE') {
        const stall=state==='walk' && engine.market?.nearby(x,z);
        if(state==='ride' || state==='walk' && engine.transit.platformAt(x,z)) busAction();
        else if(stall) browseMarket(stall);
        else if(story && (seated || storyNearby())) storyInteract();
        else if(cityOffer()) cityInteract();
        else if(story && state==='drive') leaveCar();
        else if(story && state==='walk' && carNear()) enterCar();
        else if(story) return;
        else selectMode(state==='drive'?'walk':'drive');
      }
      if(!event.repeat && key==='KeyR') reset();
      if(!event.repeat && key==='KeyH') {
        const hidden=game.classList.toggle('hud-free');
        if(hidden) toast('Press H to restore the HUD.');
        $('help').hidden=true;
        $('help-toggle').setAttribute('aria-expanded','false');
      }
    });
    window.addEventListener('keyup',event=>keys.delete(remap[event.code] || event.code));
    window.addEventListener('blur',()=>{ keys.clear(); pointer=null; });
    window.addEventListener('pagehide',()=>{if(story && state==='drive') keepCar({x,z,yaw});});
    engine.canvas.addEventListener('pointerdown',event=>{
      if(state==='intro' || state==='drive' || expanded || event.button!==0 || !$('help').hidden) return;
      pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
      engine.canvas.setPointerCapture(event.pointerId);
    });
    engine.canvas.addEventListener('pointermove',event=>{
      if(pointer?.id!==event.pointerId || expanded) return;
      const delta=(event.clientX-pointer.x)*.00335;
      if(state==='ride') rideLook+=delta;
      else yaw+=delta;
      pitch=clamp(pitch-(event.clientY-pointer.y)*.00335,-1.56,1.56);
      pointer.x=event.clientX;
      pointer.y=event.clientY;
    });
    engine.canvas.addEventListener('lostpointercapture',()=>{ pointer=null; });
    for(const button of document.querySelectorAll('[data-key]')) {
      const key=button.dataset.key;
      button.addEventListener('pointerdown',event=>{
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        keys.add(key);
      });
      button.addEventListener('lostpointercapture',()=>keys.delete(key));
    }
  }

  requestAnimationFrame(async()=>{
    try {
      if(marketDay) {
        $('light-label').textContent=lightNames[light];
        for(const id of ['scene-toggle','market-start']) {
          $(id).href='?';
          $(id).textContent='Regular day';
        }
      }
      if(campaign.view().hasSave) $('story-start').textContent='Continue story';
      if(storyMode) {
        game.classList.add('story-mode');
        $('drive-label').textContent='My car';
        for(const id of ['story-balance','story-exit','story-help']) $(id).hidden=false;
      }
      loadingProgress(5,'Reading the map');
      engine=await world.create($('scene'),{marketDay,storyMode,progress:loadingProgress});
      if(engine.market) points.splice(1,0,engine.market.start);
      loadStationPoints();
      fieldMap.build(engine.rapidLines);
      navigation=MadisonNavigation.create(data.roads);
      engine.setLight(light);
      engine.advanceTraffic(0,null);
      if(storyMode) restoreCar();
      bind();
      const watchSite=watchQuery && engine.city.snapshot().activities.find(row=>row.id===watchQuery);
      if(openingStop) {
        if(query.get('platform')==='1') visitPlatform(openingStop);
        else changeMode('walk',openingStop);
      } else if(story) changeMode('walk',storyStart());
      else if(watchSite) {
        changeMode('walk',watchSite.watch);
        cityUI.toggle(true);
      }
      else if(engine.market) changeMode('walk',engine.market.start);
      setCamera(0,0);
      engine.render(0,state==='intro'?null:[x,z,0]);
      loadingProgress(100,'Ready to explore');
      $('journal-toggle').hidden=!story;
      $('walk').disabled=$('drive').disabled=$('fly').disabled=false;
      $('ride-start').disabled=!firstRide;
      $('ride-start').hidden=!firstRide;
      $('loading').hidden=true;
      requestAnimationFrame(frame);
    } catch(error) {
      console.error(error);
      if(engine && state!=='intro') changeMode('intro',points[0]);
      $('loading-status').textContent='The 3D view could not start. Open the game in a WebGL-enabled browser.';
      $('loading-percent').hidden=$('loading-progress').hidden=true;
    }
  });
})();
