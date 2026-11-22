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
    {name:'East Washington Avenue', x:806, z:-775, yaw:-2.35}
  ];
  const keys=new Set();
  const remap={ArrowUp:'KeyW',ArrowDown:'KeyS',ArrowLeft:'KeyA',ArrowRight:'KeyD'};
  const lightNames=['Daylight','Golden hour','Blue hour'];
  const clamp=(n,min,max)=>Math.max(min,Math.min(n,max));
  const smooth=(from,to,rate,dt)=>from+(to-from)*(1-Math.exp(-rate*dt));
  let engine, state='intro', focus=points[0], light=0, expanded=false, toastTimer;
  let x=focus.x,z=focus.z,yaw=focus.yaw,pitch=-.035,speed=0,steer=0,walkTime=0,walkAmount=0;
  let pointer=null, previous=0, lastHUD=-1, lastRender=0, snap=true;
  const mapBase=document.createElement('canvas');
  mapBase.width=map.width;
  mapBase.height=map.height;
  const chart=mapBase.getContext('2d');
  const scale=.116;
  const mapX=x=>map.width*.505+x*scale, mapY=z=>map.height*.543+z*scale;
  const roadText=road=>road.name.replace(/\b(North|South|East|West)\b/g,word=>word[0]+'.');

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
      chart.beginPath();
      chart.arc(mapX(p.x),mapY(p.z),2.25,0,Math.PI*2);
      chart.fill();
    }
  }

  function drawMap() {
    ctx.drawImage(mapBase,0,0);
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
    return !world.blocked(cx,cz,1) && !world.blocked(cx+dx*1.42,cz+dz*1.42,.93)
      && !world.blocked(cx-dx*1.42,cz-dz*1.42,.93);
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
    x=-133; z=28; yaw=Math.PI/4;
  }

  function safeDrop(point) {
    x=point.x; z=point.z; yaw=point.yaw;
    if (!world.blocked(x,z,.4)) return;
    for(let radius=2;radius<=45;radius+=2) {
      for(let i=0;i<16;i++) {
        const angle=i*Math.PI/8, cx=point.x+Math.sin(angle)*radius, cz=point.z+Math.cos(angle)*radius;
        if (!world.blocked(cx,cz,.4)) { x=cx; z=cz; return; }
      }
    }
    x=points[0].x; z=points[0].z;
  }

  function changeMode(next,point) {
    if (!engine) return;
    const wasDriving=state==='drive';
    if(point) {
      focus=point;
      safeDrop(point);
      pitch=point.pitch ?? -.026;
    } else if(wasDriving && next==='walk') {
      for(const side of [1,-1]) {
        const px=x+Math.cos(yaw)*2.3*side, pz=z+Math.sin(yaw)*2.3*side;
        if(!world.blocked(px,pz,.4)) { x=px; z=pz; break; }
      }
    }
    state=next;
    if(next==='drive') driveSpawn();
    speed=steer=walkAmount=0;
    keys.clear();
    snap=true;
    game.classList.toggle('playing',next!=='intro');
    game.classList.toggle('driving',next==='drive');
    $('intro').hidden=next!=='intro';
    $('hud').hidden=next==='intro';
    $('help').hidden=true;
    $('help-toggle').setAttribute('aria-expanded','false');
    $('speedometer').hidden=next!=='drive';
    $('mode-label').lastChild.textContent=next==='drive'?' DRIVING':' WALKING';
    $('motion-label').textContent=next==='drive'?'Steer':'Move';
    $('look-tip').textContent=next==='drive'?'Space to brake':'Drag to look';
    $('mode-action').textContent=next==='drive'?'Walk':'Drive';
    engine.car.visible=next==='drive';
    setMap(false);
    updateHUD();
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
      if(!world.blocked(x+sx,z+sz,.33)) { x+=sx; z+=sz; }
      else if(!world.blocked(x+sx,z,.33)) x+=sx;
      else if(!world.blocked(x,z+sz,.33)) z+=sz;
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
      camera.position.set(665+Math.sin(seconds*.13)*20,142+Math.sin(seconds*.08)*8,650-Math.sin(seconds*.13)*20);
      camera.lookAt(-390,36,110);
      return;
    }
    const base=world.ground(x,z), dx=Math.sin(yaw), dz=-Math.cos(yaw);
    if(state==='walk') {
      const bob=walkAmount*(window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:.046)*Math.sin(walkTime);
      camera.position.set(x,snap?base+1.86:smooth(camera.position.y,base+1.86+bob,18,dt),z);
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
    const name=distance<165?nearby.name:road?.distance<42?road.name:'Downtown Madison';
    $('place-name').textContent=name;
    $('location-name').textContent=road?.distance<34 && name!==road.name?roadText(road):'Madison, Wisconsin';
    $('map-status').textContent=state==='intro'?'Capitol Square':name;
    const [lon,lat]=data.origin,[mx,mz]=data.meters;
    $('coordinates').textContent=(lat-z/mz).toFixed(5)+'° N  ·  '+Math.abs(lon+x/mx).toFixed(5)+'° W';
    $('speed').textContent=String(Math.round(Math.abs(speed)*2.23694));
    drawMap();
  }

  function frame(stamp) {
    requestAnimationFrame(frame);
    const dt=Math.min((stamp-(previous || stamp))/1000,.35);
    previous=stamp;
    if(document.hidden) return;
    if(!expanded && $('help').hidden) {
      if(state==='walk') walk(dt);
      if(state==='drive') drive(dt);
    }
    if(stamp-lastHUD>90) {
      lastHUD=stamp;
      updateHUD();
    }
    if(state==='intro' && stamp-lastRender<32) return;
    let seconds=stamp/1000;
    if(state==='intro' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) seconds=0;
    lastRender=stamp;
    setCamera(seconds,dt);
    engine.render(seconds,state==='intro'?null:[x,z]);
  }

  function bind() {
    $('walk').addEventListener('click',()=>changeMode('walk',points[0]));
    $('drive').addEventListener('click',()=>changeMode('drive',points[0]));
    $('home').addEventListener('click',()=>changeMode('intro',points[0]));
    const toggleMode=()=>{
      if(state==='drive' && Math.abs(speed)>2.3) { toast('Brake before stepping out.'); return; }
      if(state!=='intro') changeMode(state==='walk'?'drive':'walk');
    };
    const reset=()=>{
      if(state!=='intro') { changeMode(state,focus); toast('Back at '+focus.name); }
    };
    $('mode').addEventListener('click',toggleMode);
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
      button.addEventListener('click',()=>changeMode(state==='drive'?'drive':'walk',point));
      $('landmarks').append(button);
    }
    $('osm-credit').hidden=!data.osm;
    if(data.osm) $('credits-toggle').textContent='© OpenStreetMap · Map credits';
    window.addEventListener('keydown',event=>{
      if(event.altKey || event.ctrlKey || event.metaKey) return;
      const key=remap[event.code] || event.code;
      if(event.code==='Escape') {
        if(expanded) setMap(false);
        else if(!$('help').hidden) {
          $('help').hidden=true;
          $('help-toggle').setAttribute('aria-expanded','false');
        } else if(!$('credits').hidden) {
          $('credits').hidden=true;
          $('credits-toggle').setAttribute('aria-expanded','false');
        } else if(state!=='intro') changeMode('intro',points[0]);
        return;
      }
      if(event.code==='KeyM' && !event.repeat) { setMap(!expanded); return; }
      if(state==='intro' || expanded) return;
      if(['KeyW','KeyS','KeyA','KeyD','Space','ShiftLeft','ShiftRight'].includes(key)) {
        if(key==='Space' && state!=='drive') return;
        event.preventDefault();
        keys.add(key);
      }
      if(!event.repeat && key==='KeyE') toggleMode();
      if(!event.repeat && key==='KeyR') reset();
    });
    window.addEventListener('keyup',event=>keys.delete(remap[event.code] || event.code));
    window.addEventListener('blur',()=>{ keys.clear(); pointer=null; });
    engine.canvas.addEventListener('pointerdown',event=>{
      if(state!=='walk' || expanded || event.button!==0) return;
      pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
      engine.canvas.setPointerCapture(event.pointerId);
    });
    engine.canvas.addEventListener('pointermove',event=>{
      if(pointer?.id!==event.pointerId || state!=='walk') return;
      yaw+=(event.clientX-pointer.x)*.00335;
      pitch=clamp(pitch-(event.clientY-pointer.y)*.00335,-1.37,1.37);
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

  requestAnimationFrame(()=>{
    try {
      drawMapBase();
      drawMap();
      engine=world.create($('scene'));
      setCamera(0,0);
      engine.render(0);
      bind();
      $('walk').disabled=$('drive').disabled=false;
      $('loading').hidden=true;
      requestAnimationFrame(frame);
    } catch(error) {
      console.error(error);
      $('loading').textContent='The 3D view could not start. Open the game in a WebGL-enabled browser.';
    }
  });
})();
