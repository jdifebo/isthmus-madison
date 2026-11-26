(() => {
  'use strict';

  const size=144;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const point=(x,z)=>({x,z});
  const key=(id,direction)=>id+'/'+direction;
  const sites=[
    {id:'library',name:'Library Mall',title:'Library Mall guitar set',x:-1144,z:-32,yaw:2.05,start:0,period:195,duration:78},
    {id:'state',name:'State Street',title:'State Street sidewalk set',x:-443,z:-5.9,yaw:Math.PI/2,start:0,period:175,duration:55,stop:'state-east',direction:1},
    {id:'square',name:'Capitol Square',title:'Square sketch circle',x:33,z:115,yaw:2.70,start:34,period:220,duration:68,stop:'square-east',direction:1},
    {id:'paterson',name:'North Paterson Street',title:'Breese Stevens meetup',x:846,z:-876,yaw:.72,start:63,period:188,duration:62,stop:'paterson',direction:-1}
  ];

  function create(geo,layout,routes,market) {
    const rng=geo.random(66291),people=Array.from({length:size},(_,id)=>({id,phase:'idle'}));
    const coaches=routes.filter(route=>route.kind==='bus');
    const platforms=new Map(),crossings=new Map(),log=[];
    let age=0,lastTime,second=0,revision=0,feedId=0;
    const metrics={turnedHeads:0,boarded:0,exited:0,walks:0,crossed:0,delays:0,encores:0,missed:0};
    const events=sites.map(site=>({...site,place:site.name,next:site.start,until:0,cast:null,slots:[]}));
    if(market) {
      const square=events.find(event=>event.id==='square');
      Object.assign(square,{title:'Saturday Market demonstration',name:'Capitol Square market',x:market.start.x,z:market.start.z,
        yaw:market.start.yaw,stop:null,start:17,next:17,duration:72});
    }

    function open(x,z,radius=.28) {
      return !geo.inBuilding(x,z,radius) && !geo.onWater(x,z) && !market?.blocked(x,z,radius);
    }

    function footpath(a,b) {
      function clear(from,to) {
        const count=Math.ceil(dist(from,to)/1.25);
        for(let i=1;i<=count;i++) {
          const t=i/count;
          if(!open(from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t)) return false;
        }
        return true;
      }
      if(clear(a,b)) return [b];
      const x=(a.x+b.x)*.5,z=(a.z+b.z)*.5;
      for(const r of [3.8,7.5,11.5,17,23]) for(let i=0;i<12;i++) {
        const p=point(x+Math.cos(i*Math.PI/6)*r,z+Math.sin(i*Math.PI/6)*r);
        if(clear(a,p) && clear(p,b)) return [p,b];
      }
      return null;
    }

    function announce(topic,text,at) {
      log.unshift({id:++feedId,topic,text,age,x:at.x,z:at.z,name:at.name});
      if(log.length>14) log.pop();
      revision++;
    }

    function free() { return people.find(person=>person.phase==='idle'); }

    function place(person,at) {
      Object.assign(person,{x:at.x,z:at.z,dx:0,dz:1,lift:.13,moving:false});
    }

    function walk(person,way,phase,finish,pace=1.36,delay=0) {
      if(!way) return false;
      person.phase=phase;
      person.moving=false;
      person.travel={way,next:0,finish,pace:pace+rng()*.24,delay};
      return true;
    }

    function retire(person) { person.phase='idle';person.travel=null; }

    function seek(person,dx,dz) {
      const l=Math.hypot(dx,dz);
      if(l>.002) {person.dx=dx/l;person.dz=dz/l;}
    }

    function advanceWalk(person,dt) {
      const job=person.travel;
      if(job.delay>0) {job.delay-=dt;return;}
      if(!person.moving) person.moving=true;
      let step=job.pace*dt;
      while(step>0 && job.next<job.way.length) {
        const p=job.way[job.next],dx=p.x-person.x,dz=p.z-person.z,d=Math.hypot(dx,dz);
        seek(person,dx,dz);
        if(d>step) {person.x+=person.dx*step;person.z+=person.dz*step;return;}
        person.x=p.x;person.z=p.z;
        step-=d;job.next++;
      }
      person.travel=null;
      person.moving=false;
      job.finish();
    }

    for(const route of coaches) for(const [index,stop] of route.stations.entries()) {
      const id=key(stop.id,route.direction);
      const at=(u,v)=>point(stop.x+stop.dx*u-stop.dz*v,stop.z+stop.dz*u+stop.dx*v);
      const slots=Array.from({length:12},(_,i)=>{
        const side=stop.curb?-1:route.direction;
        return at(1.8+(stop.curb?1.1:0)-i*.69,side*(.67+.42*(i%2)));
      });
      platforms.set(id,{id,route,index,stop,slots,at,queue:[],next:4+rng()*20,x:stop.x,z:stop.z,name:stop.name});
    }

    function crossingFor(id,side) {
      const platform=platforms.get(key(id,1));
      if(!platform) return;
      const station=platform.stop;
      const signal=layout.signals.find(row=>dist(row,station)<12);
      if(!signal) return;
      const align=signal.axes.map(axis=>Math.abs(axis.dx*station.dx+axis.dz*station.dz));
      const axis=align[0]>=align[1]?0:1;
      const main=signal.axes[axis],perp=signal.axes[1-axis];
      const offset=-Math.sign(main.dx || 1)*(perp.extent+1.35);
      const ax=signal.x+main.dx*offset,az=signal.z+main.dz*offset;
      let px=-main.dz,pz=main.dx;
      if((px+pz)*side<0) {px=-px;pz=-pz;}
      const edge=main.extent+1.75;
      const center=point(ax,az),outer=point(ax+px*edge,az+pz*edge);
      if(!open(outer.x,outer.z) || !open(center.x,center.z)) return;
      const cross={id,signal,center,outer,waiting:[],inside:0,requested:false,holdUntil:0,last:-40,
        name:station.name+' crossing',x:outer.x,z:outer.z,yaw:Math.atan2(-px,pz)};
      crossings.set(id,cross);
    }
    crossingFor('paterson',-1);
    crossingFor('blair',1);

    function standing(person,target,face) {
      person.moving=false;
      person.x=target.x;person.z=target.z;
      seek(person,face.x-person.x,face.z-person.z);
    }

    function crowdAt(event) { return event.slots.filter(slot=>slot.person?.phase==='watch').length; }

    function clearSlot(person) {
      if(person.event) {
        const slot=person.event.slots.find(slot=>slot.person===person);
        if(slot) slot.person=null;
        person.event=null;
        revision++;
      }
    }

    function watch(person,event,delay=0) {
      const slot=event.slots.find(s=>!s.person);
      if(!event.cast || !slot) return false;
      const route=footpath(person,slot);
      if(!route) return false;
      slot.person=person;person.event=event;
      walk(person,route,'to-event',()=>{
        if(!event.cast) {clearSlot(person);wander(person);return;}
        person.phase='watch';
        standing(person,slot,event);
        metrics.turnedHeads++;
        const listening=crowdAt(event);
        if(listening===4) announce('Crowd','A few listeners stopped at '+event.name+' and others are joining them.',event);
        revision++;
      },1.1,delay);
      return true;
    }

    function scatterPoint(at,near,far) {
      for(let i=0;i<19;i++) {
        const a=rng()*Math.PI*2,r=near+rng()*(far-near),p=point(at.x+Math.cos(a)*r,at.z+Math.sin(a)*r);
        if(open(p.x,p.z)) return p;
      }
      return null;
    }

    function wander(person) {
      for(let i=0;i<5;i++) {
        const p=scatterPoint(person,11,24);
        if(p && walk(person,footpath(person,p),'leaving',()=>retire(person),1.27)) return;
      }
      retire(person);
    }

    function eventStart(event,manual=false) {
      if(event.cast || age<event.next-(manual?20:0)) return false;
      const performer=free();
      if(!performer) return false;
      place(performer,event);
      const yaw=event.yaw+.8;
      seek(performer,Math.sin(yaw),-Math.cos(yaw));
      performer.phase='perform';
      performer.feature=event.id;
      Object.assign(event,{cast:performer,until:age+event.duration,extended:false,source:age+.5});
      announce('Activity',event.title+' is starting.',event);
      return true;
    }

    function destination(platform) {
      const reachable=platform.route.stations.slice(platform.index+1);
      if(!reachable.length) return null;
      const attracted=events.filter(event=>event.cast || event.next-age<95);
      const crowd=reachable.find(stop=>attracted.some(event=>event.stop===stop.id && event.id!=='state'));
      const pick=crowd && rng()<.56?crowd:reachable[Math.floor(rng()*Math.min(reachable.length,4))];
      return pick.id;
    }

    function headFor(platform,person,delay=0) {
      if(!platform || platform.queue.length>=platform.slots.length) return false;
      const at=platform.slots[0],to=destination(platform);
      if(!to) return false;
      const leg=footpath(person,at);
      if(!leg) return false;
      walk(person,leg,'to-stop',()=>{
        if(!lineUp(platform,person,to)) wander(person);
      },1.48,delay);
      return true;
    }

    function lineUp(platform,person,to) {
      const slot=platform.slots[platform.queue.length];
      if(!slot || !to) return false;
      platform.queue.push(person);
      Object.assign(person,{phase:'waiting',to,joined:age,travel:null,lift:.43});
      if(dist(person,slot)>14) place(person,slot);
      revision++;
      return true;
    }

    function leaveQueue(platform,person) {
      const i=platform.queue.indexOf(person);
      if(i<0) return;
      platform.queue.splice(i,1);
      revision++;
    }

    function callCross(person,cross,outbound,finish,delay=0) {
      const end=outbound?cross.center:cross.outer;
      return walk(person,footpath(person,end),'to-crossing',()=>{
        cross.waiting.push({person,outbound,finish});
        person.phase='waiting-cross';
        const other=outbound?cross.outer:cross.center;
        const rank=cross.waiting.filter(entry=>entry.outbound===outbound).length-1;
        const lateral=(rank%4-.5)*.56;
        standing(person,point(end.x+(other.z-end.z)*lateral*.063,end.z+(end.x-other.x)*lateral*.063),other);
        revision++;
      },1.53,delay);
    }

    function afterShow(event) {
      const audience=event.slots.map(slot=>slot.person).filter(Boolean);
      const platform=platforms.get(key(event.stop,event.direction));
      const cross=crossings.get(event.stop);
      for(const [index,person] of audience.entries()) {
        clearSlot(person);
        if(platform && index%4!==3) {
          const reach=()=>{if(!headFor(platform,person)) wander(person);};
          if(cross && callCross(person,cross,false,reach,index*.43)) continue;
          if(!cross && headFor(platform,person,index*.46)) continue;
        }
        wander(person);
      }
      retire(event.cast);
      event.cast=null;
      event.next=age+event.period-event.duration+rng()*22;
      announce('Activity',event.title+' has wrapped up. '+(platform?'Some listeners are heading to Route A.':'Listeners are returning to the neighborhood.'),event);
    }

    for(const event of events) {
      for(let ring=0;ring<2;ring++) for(let n=0;n<9;n++) {
        const a=event.yaw+n*Math.PI*.222+ring*.21,r=2.5+ring*1.65;
        const x=event.x+Math.cos(a)*r,z=event.z+Math.sin(a)*r;
        if(open(x,z,.34)) event.slots.push({x,z,person:null});
      }
      if(event.start===0) eventStart(event);
    }

    function spawnWaiting(platform,initial=false) {
      if(platform.index>=platform.route.stations.length-1 || platform.queue.length>=platform.slots.length-1) return;
      const to=destination(platform),person=free();
      if(!person || !to) return;
      const at=platform.slots[platform.queue.length];
      place(person,at);
      const side=platform.stop.curb?-1:platform.route.direction;
      const start=platform.at(7.3+rng()*2.65,side*.67);
      const path=!initial && open(start.x,start.z)?footpath(start,at):null;
      if(!path) {lineUp(platform,person,to);return;}
      place(person,start);
      person.lift=.42;
      walk(person,path,'to-stop',()=>{if(!lineUp(platform,person,to)) wander(person);},1.41);
    }

    for(const platform of platforms.values()) {
      const count=platform.stop.id==='state-east'?9:platform.stop.id==='paterson'?5:Math.floor(rng()*4);
      for(let i=0;i<count;i++) spawnWaiting(platform,true);
    }

    function cabinet(route,stop) {
      const [x,z,dx,dz]=route.line.sample(stop.s-5.02);
      const side=stop.curb?-1:1;
      return point(x+dx*3.67+dz*side*1.34,z+dz*3.67-dx*side*1.34);
    }

    function serve(actor,route,index) {
      const stop=route.stations[index];
      const platform=platforms.get(key(stop.id,route.direction)),door=cabinet(route,stop);
      const before=actor.riders || [];
      const alighting=before.filter(person=>{
        const destinationIndex=route.stations.findIndex(candidate=>candidate.id===person.to);
        return destinationIndex<=index || index===route.stations.length-1;
      });
      actor.riders=before.filter(person=>!alighting.includes(person));
      const boarding=platform.queue.slice(0,Math.min(12,20-actor.riders.length));
      for(const [i,person] of alighting.entries()) {
        place(person,door);person.lift=.41;
        const wait=platform.at(2.2-i*.29,stop.curb?.49:-.57*route.direction);
        const event=events.find(row=>row.stop===stop.id && row.cast);
        const after=()=>{if(!event || !watch(person,event)) wander(person);};
        const cross=crossings.get(stop.id);
        walk(person,[wait],'alighting',()=>{
          metrics.exited++;
          announceExit();
          if(cross && (i%3!==2 || event) && callCross(person,cross,true,after)) return;
          after();
        },1.45,.70+i*.39);
      }
      function announceExit() {
        if(alighting.length>2 && !announced) {
          announced=true;
          announce('Transit',alighting.length+' riders got off at '+stop.name+(crossings.has(stop.id)?'. Some are heading to the crosswalk.':'.'),platform);
        }
      }
      let announced=false;
      for(const [i,person] of boarding.entries()) {
        leaveQueue(platform,person);
        actor.riders.push(person);
        walk(person,[door],'boarding',()=>{person.phase='onboard';},1.85,1.18+i*.36);
      }
      metrics.boarded+=boarding.length;
      const extra=Math.min(8,Math.max(0,(boarding.length-2)*.73+alighting.length*.32));
      if(boarding.length>=3) {
        metrics.delays++;
        const seconds=Math.round(extra);
        announce('Transit',boarding.length+' riders are boarding at '+stop.name+'. The coach is holding its doors '+seconds+
          (seconds===1?' second longer.':' seconds longer.'),platform);
      }
      revision++;
      return extra;
    }

    function updateQueue(platform,dt) {
      for(const [i,person] of platform.queue.entries()) {
        const slot=platform.slots[i],dx=slot.x-person.x,dz=slot.z-person.z,d=Math.hypot(dx,dz);
        person.moving=d>.15;
        if(person.moving) {
          seek(person,dx,dz);
          const step=Math.min(d,dt*1.15);
          person.x+=person.dx*step;person.z+=person.dz*step;
        } else seek(person,platform.x-person.x,platform.z-person.z);
      }
    }

    function crossBatch(cross,absolute,clear) {
      const {signal,center,outer}=cross;
      if(signal.cityHold) {
        if(cross.inside===0 && age>=cross.holdUntil) {signal.cityHold=false;cross.last=age;revision++;}
        return;
      }
      if(!cross.waiting.length && !cross.requested || age-cross.last<20) return;
      const {signalPhase,yellow}=MadisonTraffic;
      if(signalPhase(signal,0,absolute)<yellow || signalPhase(signal,1,absolute)<yellow || !clear(center,outer)) return;
      const wave=cross.waiting.splice(0,8);
      cross.requested=false;
      cross.inside=wave.length;
      signal.cityHold=true;
      cross.holdUntil=age+(wave.length?1.5:9.5);
      metrics.walks++;
      const walkers=wave.length===1?'1 person is':wave.length+' people are';
      announce('Crossing',wave.length?walkers+' crossing at '+signalName(cross.id)+'. The traffic lights are holding red.':
        'Walk signal called at '+signalName(cross.id)+'. The traffic lights are holding red.',cross);
      for(const [i,{person,outbound,finish}] of wave.entries()) {
        const end=outbound?outer:center;
        person.lift=.25;
        walk(person,[end],'crossing',()=>{
          cross.inside--;metrics.crossed++;
          finish();
        },1.73,i*.42);
      }
    }

    const signalName=id=>id==='paterson'?'Paterson':'Blair';

    function everySecond() {
      for(const platform of platforms.values()) {
        if(age>=platform.next) {
          spawnWaiting(platform);
          platform.next=age+13+rng()*23;
        }
        const impatient=platform.queue[0];
        if(impatient && age-impatient.joined>99 && platform.queue.length>2) {
          leaveQueue(platform,impatient);
          metrics.missed++;
          if(platform.queue.length>=5) announce('Transit','Some riders at '+platform.name+' have started walking while they wait.',platform);
          wander(impatient);
        }
      }
      for(const event of events) {
        if(!event.cast) {eventStart(event);continue;}
        if(age>=event.until) {afterShow(event);continue;}
        if(age<event.source || event.slots.filter(slot=>slot.person).length>=11) continue;
        const following=crowdAt(event)>=4;
        event.source=age+(following?1.8:4.7)+rng()*2.1;
        const p=scatterPoint(event,following?7:4.7,following?16:8.5),person=free();
        if(!p || !person) continue;
        place(person,p);
        if(!watch(person,event)) wander(person);
      }
    }

    function advance(time,clear=()=>true) {
      const dt=lastTime===undefined?0:Math.min(.25,Math.max(0,time-lastTime));
      lastTime=time;
      age+=dt;
      if(!dt) return;
      if(Math.floor(age)>second) {second=Math.floor(age);everySecond();}
      for(const person of people) if(person.travel) advanceWalk(person,dt);
      for(const platform of platforms.values()) if(platform.queue.length) updateQueue(platform,dt);
      for(const cross of crossings.values()) crossBatch(cross,time,clear);
    }

    function nearby(x,z) {
      const at={x,z};
      const cross=[...crossings.values()].find(row=>dist(row,at)<4.8);
      if(cross) return {key:'cross:'+cross.id,action:cross.signal.cityHold?'Walk signal on':cross.requested?'Walk signal requested':'Call walk signal',name:cross.name,
        disabled:cross.signal.cityHold||cross.requested};
      const event=events.find(row=>dist(row,at)<6 && (row.cast || age>=row.next-20));
      if(!event) return null;
      return {key:'event:'+event.id,action:event.cast?(event.extended?'Encore requested':'Ask for an encore'):'Start the activity',name:event.title,
        disabled:Boolean(event.cast && event.extended)};
    }

    function act(x,z) {
      const offer=nearby(x,z);
      if(!offer || offer.disabled) return null;
      const [kind,id]=offer.key.split(':');
      if(kind==='cross') {
        const cross=crossings.get(id);
        cross.requested=true;
        revision++;
        return 'Walk requested. Wait for traffic to stop.';
      }
      const event=events.find(event=>event.id===id);
      if(!event.cast) return eventStart(event,true)?event.title+' is starting.':null;
      event.until+=33;
      event.extended=true;
      metrics.encores++;
      announce('Activity','Encore at '+event.name+'. The audience is sticking around.',event);
      return 'Encore requested. People are staying for another round.';
    }

    function eventsView() {
      return events.map(event=>({id:event.id,name:event.title,place:event.place,active:Boolean(event.cast),listeners:crowdAt(event),
        inTime:Math.ceil(Math.max(0,(event.cast?event.until:event.next)-age)),x:event.x,z:event.z,yaw:event.yaw,
        watch:{name:event.place+' activity',x:event.x-9.4,z:event.z-2,yaw:1.78}}));
    }

    function status(id) {
      return [1,-1].reduce((count,direction)=>count+(platforms.get(key(id,direction))?.queue.length || 0),0);
    }

    function snapshot() {
      const activities=eventsView(),crosswalks=[...crossings.values()].map(cross=>({x:cross.x,z:cross.z,name:cross.name,id:cross.id,
        active:Boolean(cross.signal.cityHold),waiting:cross.waiting.length,requested:cross.requested}));
      return {activities,crosswalks,version:revision,age,feed:log,stats:{...metrics},
        crowds:[...platforms.values()].filter(row=>row.queue.length>=4).map(row=>({x:row.x,z:row.z,count:row.queue.length}))};
    }

    function blocksCar(x,z) {
      for(const cross of crossings.values()) {
        if(cross.signal.cityHold && geo.segmentDistance(x,z,cross.center.x,cross.center.z,cross.outer.x,cross.outer.z)<1.51**2) return true;
      }
      return false;
    }
    return {people,serve,advance,status,snapshot,nearby,act,blocksCar,time:()=>age};
  }

  window.MadisonCity={create};
})();
