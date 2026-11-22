(() => {
  'use strict';

  const $=id=>document.getElementById(id);
  const game=$('game'), map=$('map'), ctx=map.getContext('2d');
  const data=window.MADISON, world=window.MadisonWorld;
  const points=[
    {name:'Capitol Square', x:-151, z:-4, yaw:Math.PI/2, pitch:.19},
    {name:'State Street', x:-474, z:-11, yaw:Math.PI/2},
    {name:'Memorial Union', x:-1234, z:-157, yaw:-.75},
    {name:'Monona Terrace', x:238, z:229, yaw:2.35},
    {name:'James Madison Park', x:135, z:-777, yaw:-.65},
    {name:'East Washington Avenue', x:806, z:-775, yaw:-2.35},
    {name:'Orton Park', x:1718, z:-644, yaw:1.95, pitch:-.035, above:55, marker:[1711,-701]},
    {name:'Breese Stevens Field', x:839, z:-886, yaw:.73, above:78, flyPitch:-.56, marker:[899,-967]}
  ];
  const stationPoints=[];
  const query=new URLSearchParams(window.location.search);
  const marketDay=query.get('market')==='1';
  const marketBasket=new Set();
  const stallDialog=$('stall-dialog');
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
  const mapBase=document.createElement('canvas');
  mapBase.width=map.width;
  mapBase.height=map.height;
  const chart=mapBase.getContext('2d');
  const scale=.116;
  const mapX=x=>map.width*.505+x*scale, mapY=z=>map.height*.543+z*scale;
  const roadText=road=>road.name.replace(/\b(North|South|East|West)\b/g,word=>word[0]+'.');

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

  function trace(context,line) {
    for (let i=0;i<line.length;i++) {
      const [px,pz]=line[i];
      if (i) context.lineTo(mapX(px),mapY(pz));
      else context.moveTo(mapX(px),mapY(pz));
    }
  }

  function drawMapBase() {
    chart.fillStyle='#364a3e';
    chart.fillRect(0,0,map.width,map.height);
    chart.strokeStyle='#ffffff0b';
    chart.lineWidth=1;
    for(let i=8;i<map.width;i+=24) {
      chart.beginPath(); chart.moveTo(i,0); chart.lineTo(i,map.height); chart.stroke();
    }
    for(let i=5;i<map.height;i+=24) {
      chart.beginPath(); chart.moveTo(0,i); chart.lineTo(map.width,i); chart.stroke();
    }
    chart.fillStyle='#526748';
    for(const [,poly] of data.parks) {
      chart.beginPath();
      for(const ring of poly) { trace(chart,ring); chart.closePath(); }
      chart.fill('evenodd');
    }
    chart.fillStyle='#203d45';
    chart.strokeStyle='#85a9a66a';
    chart.lineWidth=1.15;
    for(const polygon of data.water) {
      chart.beginPath();
      for(const ring of polygon) { trace(chart,ring); chart.closePath(); }
      chart.fill('evenodd');
      chart.stroke();
    }
    chart.strokeStyle='#ac9f7f';
    chart.lineJoin=chart.lineCap='round';
    for(const [name,kind,width,,line] of data.roads) {
      chart.globalAlpha=kind===0?.69:kind===2?.83:kind===1?.31:.16;
      chart.strokeStyle=kind===2?'#dbc08d':kind===0?'#c1b293':'#d3c4a7';
      chart.lineWidth=kind===2?1.8:Math.max(.65,width*.09);
      chart.beginPath();
      trace(chart,line);
      chart.stroke();
    }
    chart.globalAlpha=.94;
    chart.strokeStyle='#e48c74';
    chart.lineWidth=1.75;
    chart.beginPath();
    if(engine?.rapidLines.length) {
      for(const line of engine.rapidLines) trace(chart,line);
    } else {
      for(const [,,,,line,bus] of data.roads) if(bus) trace(chart,line);
    }
    chart.stroke();
    chart.globalAlpha=1;
    chart.font='italic 19px Georgia';
    chart.fillStyle='#9cbeba';
    chart.fillText('Lake Mendota',43,69);
    chart.fillText('Lake Monona',316,279);
    chart.fillStyle='#c9bda0';
    chart.fillRect(18,290,58,1.3);
    chart.fillRect(18,286,1.2,8);
    chart.fillRect(75,286,1.2,8);
    chart.font='13px system-ui';
    chart.fillText('500 m',18,307);
    chart.fillStyle='#e6c291';
    for (const p of points) {
      const [x,z]=p.marker || [p.x,p.z];
      chart.beginPath();
      chart.fillStyle=p.transit?'#ffbc9c':'#e6c291';
      chart.arc(mapX(x),mapY(z),p.transit?3.1:2.25,0,Math.PI*2);
      chart.fill();
      if(p.transit) {
        chart.strokeStyle='#263c44';
        chart.lineWidth=1;
        chart.stroke();
      }
    }
  }

  function drawMap() {
    ctx.drawImage(mapBase,0,0);
    for(const [bx,bz,dx,dz,boarding] of engine?.buses || []) {
      ctx.save();
      ctx.translate(mapX(bx),mapY(bz));
      ctx.rotate(Math.atan2(dx,-dz));
      ctx.fillStyle=boarding?'#e1faf5':'#6cd6dc';
      ctx.strokeStyle='#1b3540';
      ctx.lineWidth=1.05;
      ctx.fillRect(-2,-4,4,8);
      ctx.strokeRect(-2,-4,4,8);
      ctx.restore();
    }
    const px=mapX(x),py=mapY(z);
    ctx.save();
    ctx.translate(px,py);
    ctx.rotate(yaw);
    ctx.beginPath();
    ctx.moveTo(0,-11); ctx.lineTo(5,5); ctx.lineTo(0,2.4); ctx.lineTo(-5,5); ctx.closePath();
    ctx.fillStyle='#ffb57f';
    ctx.strokeStyle='#172622';
    ctx.lineWidth=1.4;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function setMap(open) {
    expanded=open;
    $('map-card').classList.toggle('expanded',open);
    $('map-toggle').setAttribute('aria-expanded',String(open));
    $('map-close').hidden=!open;
    $('map-details').hidden=!open;
    keys.clear();
    pointer=null;
    if (open) {
      $('help').hidden=true;
      $('help-toggle').setAttribute('aria-expanded','false');
    }
  }

  function toast(message) {
    $('toast').textContent=message;
    $('toast').hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{$('toast').hidden=true;},2400);
  }

  function heading(dx,dz) {
    return Math.atan2(dx,-dz);
  }

  function carAllowed(cx,cz,angle) {
    const dx=Math.sin(angle), dz=-Math.cos(angle);
    const blocked=(x,z,radius)=>groundBlocked(x,z,radius)||engine.market?.drivingBlocked(x,z,radius);
    return !blocked(cx,cz,1) && !blocked(cx+dx*1.42,cz+dz*1.42,.93)
      && !blocked(cx-dx*1.42,cz-dz*1.42,.93);
  }

  function groundBlocked(x,z,radius) {
    return world.blocked(x,z,radius) || engine.trafficBlocked(x,z,radius) || engine.market?.blocked(x,z,radius);
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
    const previousMode=state;
    if(previousMode==='ride' && next!=='ride') {
      engine.transit.release();
      rideView=null;
      stopRequested=false;
    }
    let landedAway=false;
    if(point) {
      focus=point;
      const destination=next==='fly'?point:(safeDrop(point) || points[0]);
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
    if(next==='drive') driveSpawn();
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
    $('help').hidden=true;
    $('help-toggle').setAttribute('aria-expanded','false');
    $('speedometer').hidden=next!=='drive';
    $('altimeter').hidden=next!=='fly';
    $('mode-label').lastChild.textContent=' '+(modeNames[next] || modeNames.walk);
    $('motion-label').textContent={walk:'Move',drive:'Steer',fly:'Fly'}[next] || 'Move';
    $('look-tip').textContent=next==='drive'?'Space to brake':'Drag to look';
    for(const mode of travelModes) $('mode-'+mode).setAttribute('aria-pressed',String(mode===next));
    engine.car.visible=next==='drive';
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
    if(!platform) return;
    const station=stationPoints.find(point=>point.stationId===platform.id);
    changeMode('walk',{...station,...platform,name:station?.name || platform.name});
    toast('Stepped off at '+platform.name+'.');
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
    if(state!=='walk') return;
    const boarded=engine.transit.board(x,z);
    if(!boarded) { toast('Wait for the platform doors to open.'); return; }
    rideView=engine.transit.ride();
    rideLook=.10;
    pitch=-.025;
    stopRequested=false;
    changeMode('ride');
  }

  function updateTransitPanel() {
    const waiting=state==='walk'?engine.transit.stationStatus(x,z):null;
    const riding=state==='ride'?rideView:null;
    const direction=riding?.direction || waiting?.direction;
    const panel=$('transit-panel'),button=$('transit-action');
    panel.hidden=!riding&&!waiting;
    if(panel.hidden) return;
    let action,status;
    if(riding) {
      action=riding.open?'Step off':stopRequested?'Cancel request':'Request stop';
      if(riding.open) status='Doors open at '+riding.station;
      else if(stopRequested) status='Stop requested for '+riding.next;
      else if(riding.station) status='At '+riding.station;
      else status='Next stop · '+riding.next;
    } else {
      action=waiting.boarding?'Board bus':'';
      status=waiting.boarding?'Doors open at '+waiting.name:'Waiting at '+waiting.name;
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

  function setCamera(seconds,dt) {
    const camera=engine.camera;
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
      const y=state==='fly'?altitude:base+1.86+(engine.transit.platformAt(x,z)?.height || 0);
      camera.position.set(x,state==='fly' || snap?y:smooth(camera.position.y,y+bob,18,dt),z);
      camera.lookAt(x+dx*Math.cos(pitch),camera.position.y+Math.sin(pitch),z+dz*Math.cos(pitch));
    } else {
      const car=engine.car;
      car.position.set(x,base+.19,z);
      const front=world.ground(x+dx*1.7,z+dz*1.7);
      const back=world.ground(x-dx*1.7,z-dz*1.7);
      car.rotation.set(Math.atan2(front-back,3.4),-yaw,0,'YXZ');
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
    const name=lake || (distance<(nearby.transit?53:165)?nearby.name:road?.distance<42?road.name:'Downtown Madison');
    $('place-name').textContent=rideView?'Metro Rapid':name;
    $('location-name').textContent=rideView?(road?.distance<40?roadText(road):'Madison, Wisconsin'):
      road?.distance<34 && name!==road.name?roadText(road):'Madison, Wisconsin';
    $('map-status').textContent=state==='intro'?'Capitol Square':rideView?'Route A · '+(rideView.station || rideView.direction):name;
    const [lon,lat]=data.origin,[mx,mz]=data.meters;
    $('coordinates').textContent=(lat-z/mz).toFixed(5)+'° N  ·  '+Math.abs(lon+x/mx).toFixed(5)+'° W';
    $('speed').textContent=String(Math.round(Math.abs(speed)*2.23694));
    $('altitude').textContent=String(Math.round(Math.max(0,altitude-world.ground(x,z))));
    updateTransitPanel();
    const stall=state==='walk' && $('transit-panel').hidden && engine.market?.nearby(x,z);
    $('market-panel').hidden=!stall;
    if(stall && $('market-stall-name').textContent!==stall.name) $('market-stall-name').textContent=stall.name;
    drawMap();
  }

  function frame(stamp) {
    requestAnimationFrame(frame);
    const dt=Math.min((stamp-(previous || stamp))/1000,.35);
    previous=stamp;
    if(document.hidden) return;
    if(!expanded && $('help').hidden && !stallDialog.open) {
      if(state==='walk') walk(dt);
      if(state==='drive') drive(dt);
      if(state==='fly') fly(dt);
    }
    if(state==='intro' && stamp-lastRender<32) return;
    let seconds=stamp/1000;
    if(state==='intro' && reducedMotion.matches) seconds=0;
    lastRender=stamp;
    engine.advanceTraffic(state==='intro'?0:seconds,state==='walk' || state==='drive'?[x,z]:null);
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
    const walkStart=engine.market?.start || points[0];
    $('walk').addEventListener('click',()=>changeMode('walk',walkStart));
    $('drive').addEventListener('click',()=>changeMode('drive',points[0]));
    $('fly').addEventListener('click',()=>changeMode('fly',flyover));
    $('ride-start').addEventListener('click',()=>visitPlatform(firstRide));
    $('transit-action').addEventListener('click',busAction);
    $('market-browse').addEventListener('click',()=>browseMarket());
    $('market-close').addEventListener('click',()=>stallDialog.close());
    $('home').addEventListener('click',()=>changeMode('intro',points[0]));
    const selectMode=mode=>{
      if(mode===state) return;
      if(state==='ride') {
        if(mode==='walk') busAction();
        else toast('Step off at a station to change travel modes.');
        return;
      }
      if(state==='drive' && mode==='walk' && Math.abs(speed)>2.3) { toast('Brake before stepping out.'); return; }
      changeMode(mode,state==='intro'?(mode==='fly'?flyover:mode==='walk'?walkStart:points[0]):undefined);
    };
    const reset=()=>{
      if(state!=='intro') { changeMode(state==='ride'?'walk':state,focus); toast('Back at '+focus.name); }
    };
    for(const mode of travelModes) $('mode-'+mode).addEventListener('click',()=>selectMode(mode));
    $('reset').addEventListener('click',reset);
    $('light').addEventListener('click',()=>{
      light=(light+1)%lightNames.length;
      engine.setLight(light);
      $('light-label').textContent=lightNames[light];
    });
    $('map-toggle').addEventListener('click',()=>setMap(!expanded));
    $('map-close').addEventListener('click',()=>setMap(false));
    $('map-expand').addEventListener('click',()=>setMap(true));
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
    for(const point of points) {
      const button=document.createElement('button');
      button.type='button';
      button.textContent=point.name;
      if(point.transit) button.classList.add('transit-stop');
      button.addEventListener('click',()=>{
        const mode=state==='intro' || state==='ride'?'walk':state;
        if(point.transit && mode==='walk') visitPlatform(point);
        else changeMode(mode,point);
      });
      $('landmarks').append(button);
    }
    $('transit-legend').hidden=!stationPoints.length;
    if(marketDay) $('transit-legend-label').textContent='Metro Rapid detour';
    $('osm-credit').hidden=!data.osm;
    if(data.osm) $('credits-toggle').textContent='© OpenStreetMap · Map credits';
    window.addEventListener('keydown',event=>{
      if(event.altKey || event.ctrlKey || event.metaKey || stallDialog.open) return;
      const key=remap[event.code] || event.code;
      if(event.code==='Escape') {
        if(game.classList.contains('hud-free')) game.classList.remove('hud-free');
        else if(expanded) setMap(false);
        else if(!$('help').hidden) {
          $('help').hidden=true;
          $('help-toggle').setAttribute('aria-expanded','false');
        } else if(!$('credits').hidden) {
          $('credits').hidden=true;
          $('credits-toggle').setAttribute('aria-expanded','false');
        } else if(state!=='intro') changeMode('intro',points[0]);
        return;
      }
      if(event.code==='KeyM' && !event.repeat) { game.classList.remove('hud-free'); setMap(!expanded); return; }
      if(!event.repeat && modeKeys[key] && !expanded) { selectMode(modeKeys[key]); return; }
      if(!event.repeat && key==='KeyF' && !expanded) { selectMode(state==='fly'?'walk':'fly'); return; }
      if(state==='intro' || expanded) return;
      if(state!=='ride' && ['KeyW','KeyS','KeyA','KeyD','KeyC','Space','ShiftLeft','ShiftRight'].includes(key)) {
        if(key==='Space' && state==='walk') return;
        event.preventDefault();
        keys.add(key);
      }
      if(!event.repeat && key==='KeyE') {
        const stall=state==='walk' && engine.market?.nearby(x,z);
        if(state==='ride' || state==='walk' && engine.transit.platformAt(x,z)) busAction();
        else if(stall) browseMarket(stall);
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
      loadingProgress(5,'Reading the map');
      drawMapBase();
      drawMap();
      engine=await world.create($('scene'),{marketDay,progress:loadingProgress});
      if(engine.market) points.splice(1,0,engine.market.start);
      loadStationPoints();
      drawMapBase();
      engine.setLight(light);
      engine.advanceTraffic(0,null);
      bind();
      if(openingStop) {
        if(query.get('platform')==='1') visitPlatform(openingStop);
        else changeMode('walk',openingStop);
      } else if(engine.market) changeMode('walk',engine.market.start);
      setCamera(0,0);
      engine.render(0,state==='intro'?null:[x,z,0]);
      loadingProgress(100,'Ready to explore');
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
