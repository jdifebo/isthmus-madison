(() => {
  'use strict';

  const colors={route:'#ffcb77',walk:'#63e0de',player:'#eaffff',bus:'#80d5bc',parked:'#93c8ff',place:'#e9cfab'};
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

  function create(canvas,data,storage) {
    const ctx=canvas.getContext('2d');
    const [west,north,east,south]=data.bounds;
    const base=document.createElement('canvas');
    const textureScale=.78;
    base.width=Math.ceil((east-west)*textureScale);
    base.height=Math.ceil((south-north)*textureScale);
    const ink=base.getContext('2d');
    const labels=new Map();
    let northUp=true;
    try { northUp=storage?.getItem('isthmus-map-heading')!=='forward'; } catch {}
    let expanded=false,view,center=[0,0],zoom=1,last,drag=null,streetLayer=[];

    function path(g,points,close=false) {
      if(!points.length) return;
      g.moveTo(...points[0]);
      for(let i=1;i<points.length;i++) g.lineTo(...points[i]);
      if(close) g.closePath();
    }

    function build(routes) {
      ink.setTransform(1,0,0,1,0,0);
      ink.fillStyle='#2b3e3a';
      ink.fillRect(0,0,base.width,base.height);
      ink.setTransform(textureScale,0,0,textureScale,-west*textureScale,-north*textureScale);
      for(const [,poly] of data.parks) {
        ink.fillStyle='#415741';
        ink.beginPath();
        for(const ring of poly) path(ink,ring,true);
        ink.fill('evenodd');
      }
      for(const poly of data.water) {
        ink.fillStyle='#193d4a';
        ink.strokeStyle='#638587';
        ink.lineWidth=2;
        ink.beginPath();
        for(const ring of poly) path(ink,ring,true);
        ink.fill('evenodd');
        ink.stroke();
      }
      ink.fillStyle='#26332f';
      for(const [,,kind,,poly] of data.houses) {
        if(kind===2) continue;
        ink.beginPath();
        for(const ring of poly) path(ink,ring,true);
        ink.fill('evenodd');
      }
      for(const [name,kind,width,,line] of data.roads) {
        ink.lineJoin=ink.lineCap='round';
        ink.strokeStyle=['#b79d7d','#938a74','#d4bd91','#71846f','#687568'][kind] || '#687568';
        ink.lineWidth=kind===3?1.7:kind===4?1.2:Math.max(3,width*.60);
        ink.beginPath();
        path(ink,line);
        ink.stroke();
        if(!name || kind>2) continue;
        const spacing=kind===0?95:130;
        for(let i=1;i<line.length;i++) {
          const a=line[i-1],b=line[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
          if(d<12) continue;
          const count=Math.max(1,Math.floor(d/spacing));
          for(let j=0;j<count;j++) {
            const t=(j+.5)/count,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
            const key=Math.round(x/88)+','+Math.round(z/88)+','+name;
            if(!labels.has(key)) labels.set(key,{name,x,z,importance:kind===2?0:kind});
          }
        }
      }
      streetLayer=Array.from(labels.values()).sort((a,b)=>a.importance-b.importance);
      ink.strokeStyle='#bc826a';
      ink.lineWidth=3.5;
      for(const line of routes) {
        ink.beginPath();
        path(ink,line);
        ink.stroke();
      }
    }

    function orientation() { return northUp; }
    function toggle() {
      northUp=!northUp;
      try { storage?.setItem('isthmus-map-heading',northUp?'north':'forward'); } catch {}
      if(last) draw(last);
      return northUp;
    }
    function size() {
      const rect=canvas.getBoundingClientRect(),ratio=Math.min(1.6,window.devicePixelRatio || 1);
      const w=Math.max(240,Math.round(rect.width*ratio)),h=Math.max(144,Math.round(rect.height*ratio));
      if(canvas.width!==w || canvas.height!==h) {canvas.width=w;canvas.height=h;}
    }
    function open(isOpen,player,target) {
      expanded=isOpen;
      if(!expanded) return;
      center=target?[(player.x+target.x)/2,(player.z+target.z)/2]:[player.x,player.z];
      const span=Math.max(830, target?Math.hypot(target.x-player.x,target.z-player.z)*1.32:1200);
      zoom=Math.floor(Math.min(canvas.clientWidth || 700,canvas.clientHeight || 540))/span;
      zoom=clamp(zoom,.18,1.6);
    }
    function recenter() {
      if(last) {
        center=[last.player.x,last.player.z];
        draw(last);
      }
    }
    function magnify(multiplier) {
      zoom=clamp(zoom*multiplier,.13,2.2);
      if(last) draw(last);
    }
    function project(x,z) {
      const dx=x-view.x,dz=z-view.z;
      return [view.cx+(dx*view.cos-dz*view.sin)*view.scale,view.cz+(dx*view.sin+dz*view.cos)*view.scale];
    }
    function flag(x,z,shape,color,edge=false,angle=0) {
      const [px,pz]=project(x,z),{width:w,height:h}=canvas;
      const border=13,s=expanded?1.25:1;
      let a=px,b=pz,off=false;
      if(edge && (px<border || pz<border || px>w-border || pz>h-border)) {
        const dx=px-w/2,dz=pz-h/2;
        const scale=Math.min((w/2-border)/Math.max(1,Math.abs(dx)),(h/2-border)/Math.max(1,Math.abs(dz)));
        a=w/2+dx*scale;b=h/2+dz*scale;
        angle=Math.atan2(dx,-dz);
        shape='pointer';off=true;
      } else if(px<0 || pz<0 || px>w || pz>h) return null;
      ctx.save();
      ctx.translate(a,b);
      ctx.rotate(angle);
      ctx.scale(s,s);
      ctx.fillStyle=color;
      ctx.strokeStyle='#182628';
      ctx.lineWidth=1.6;
      ctx.beginPath();
      if(shape==='player' || shape==='pointer') {
        ctx.moveTo(0,-10);ctx.lineTo(5,5);ctx.lineTo(0,shape==='player'?2.6:3);ctx.lineTo(-5,5);ctx.closePath();
      } else if(shape==='goal') {
        ctx.moveTo(0,-7);ctx.lineTo(7,0);ctx.lineTo(0,7);ctx.lineTo(-7,0);ctx.closePath();
      } else if(shape==='car' || shape==='bus') {
        ctx.roundRect(-4,-5,8,10,shape==='car'?2.5:1.5);
      } else {
        ctx.arc(0,0,shape==='stop'?4.2:2.8,0,Math.PI*2);
      }
      ctx.fill();ctx.stroke();
      ctx.restore();
      return [a,b,off];
    }
    function draw(state) {
      last=state;
      const {player,target,route,points,buses,car}=state;
      size();
      const {width:w,height:h}=canvas,angle=expanded || northUp?0:-player.yaw;
      const scale=expanded?zoom*Math.min(1.6,window.devicePixelRatio || 1):w/(player.flying?1120:650);
      view={x:expanded?center[0]:player.x,z:expanded?center[1]:player.z,cx:w/2,cz:h/2,
        cos:Math.cos(angle),sin:Math.sin(angle),scale,angle};
      ctx.setTransform(1,0,0,1,0,0);
      ctx.fillStyle='#193640';
      ctx.fillRect(0,0,w,h);
      ctx.save();
      ctx.translate(w/2,h/2);
      ctx.rotate(angle);
      ctx.scale(scale,scale);
      ctx.drawImage(base,west-view.x,north-view.z,east-west,south-north);
      ctx.restore();

      if(route?.points.length) {
        const locations=route.points.map(point=>project(point.x,point.z));
        locations[0]=project(player.x,player.z);
        ctx.lineJoin=ctx.lineCap='round';
        ctx.beginPath();path(ctx,locations);
        ctx.strokeStyle='#1d3537';ctx.lineWidth=expanded?8:5.6;ctx.stroke();
        ctx.strokeStyle=player.mode==='drive'?colors.route:colors.walk;ctx.lineWidth=expanded?4.3:3;ctx.stroke();
      }
      if(expanded || w>=250) {
        const used=[];
        ctx.font=`${expanded?12:10}px system-ui`;
        ctx.textAlign='center';
        ctx.lineWidth=2.3;
        ctx.strokeStyle='#243b3a';
        ctx.fillStyle='#e4ddc6';
        for(const row of streetLayer) {
          if(!expanded && row.importance>0) continue;
          const [px,pz]=project(row.x,row.z);
          if(px<28 || pz<12 || px>w-28 || pz>h-10 || Math.hypot(px-w/2,pz-h/2)<15) continue;
          const label=row.name.replace(/\b(North|East|South|West)\b/g,n=>n[0]+'.').replace(' Avenue',' Ave').replace(' Street',' St');
          const half=ctx.measureText(label).width/2+4;
          if(used.some(([x,z,right,name])=>name===row.name && Math.hypot(px-x,pz-z)<(expanded?350:160)
            || Math.abs(pz-z)<14 && Math.abs(px-x)<half+right)) continue;
          used.push([px,pz,half,row.name]);
          ctx.strokeText(label,px,pz);ctx.fillText(label,px,pz);
          if(used.length>=(expanded?26:5)) break;
        }
      }
      for(const p of points) flag(p.x,p.z,p.transit?'stop':'place',p.transit?colors.bus:colors.place);
      for(const [x,z,dx,dz,boarding] of buses) flag(x,z,'bus',boarding?'#b7f1db':colors.bus,false,Math.atan2(dx,-dz)+angle);
      if(car) flag(car.x,car.z,'car',colors.parked,true,car.yaw+angle);
      if(target) flag(target.x,target.z,'goal',colors.route,true);
      flag(player.x,player.z,'player',colors.player,true,player.yaw+angle);

      ctx.fillStyle='#182c34d9';
      ctx.fillRect(7,7,35,25);
      ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillStyle='#ffe2ab';ctx.fillText('N',18,23);
      ctx.save();ctx.translate(31,20);ctx.rotate(angle);
      ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(4,5);ctx.lineTo(0,3);ctx.lineTo(-4,5);ctx.closePath();ctx.fill();
      ctx.restore();
    }

    canvas.addEventListener('pointerdown',event=>{
      if(!expanded || event.button!==0) return;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove',event=>{
      if(drag?.id!==event.pointerId) return;
      center[0]=clamp(center[0]-(event.clientX-drag.x)/zoom,west,east);
      center[1]=clamp(center[1]-(event.clientY-drag.y)/zoom,north,south);
      drag.x=event.clientX;drag.y=event.clientY;
      if(last) draw(last);
    });
    canvas.addEventListener('lostpointercapture',()=>{drag=null;});
    canvas.addEventListener('wheel',event=>{
      if(!expanded) return;
      event.preventDefault();magnify(event.deltaY>0?.86:1.16);
    },{passive:false});
    return {build,draw,open,toggle,orientation,recenter,magnify};
  }

  window.MadisonFieldMap={create};
})();
