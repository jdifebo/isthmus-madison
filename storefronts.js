(() => {
  'use strict';

  const T=THREE;

  function create(scene,geo) {
    const {box,cylinder,ground,batch,mergeLandmark,pavingMaterial}=geo;
    const root=new T.Group();
    root.name='Campaign places';
    scene.add(root);
    const matte=color=>new T.MeshLambertMaterial({color});
    const brick=matte(0xb7aca0),charcoal=matte(0x282b2d),steel=matte(0x838c86);
    const cream=matte(0xd6c6aa),wood=matte(0x806244),red=matte(0xa62d35),blue=matte(0x263a47);
    const warm=new T.MeshLambertMaterial({color:0xfbe4a4,emissive:0xf4a75d,emissiveIntensity:.22});

    function texture(width,height,draw) {
      const canvas=document.createElement('canvas');
      canvas.width=width;
      canvas.height=height;
      draw(canvas.getContext('2d'),width,height);
      const map=new T.CanvasTexture(canvas);
      map.colorSpace=T.SRGBColorSpace;
      map.anisotropy=4;
      return new T.MeshBasicMaterial({map});
    }

    function sign(text,sub,background,ink,serif=false,aspect=4.8) {
      return texture(1024,Math.round(1024/aspect),(ctx,w,h)=>{
        ctx.fillStyle=background;
        ctx.fillRect(0,0,w,h);
        ctx.textAlign='center';
        ctx.fillStyle=ink;
        ctx.font=(serif?'600 ':'700 ')+Math.round(h*(sub?.56:.67))+(serif?'px Georgia':'px system-ui');
        ctx.fillText(text,w/2,h*(sub?.59:.73),w*.91);
        if(sub) {
          ctx.font='700 '+Math.round(h*.23)+'px system-ui';
          ctx.fillText(sub,w/2,h*.90,w*.89);
        }
      });
    }

    function display(cheese,variant) {
      const random=geo.random((cheese?387:815)+variant*67);
      return texture(384,320,(ctx,w,h)=>{
        const wall=ctx.createLinearGradient(0,0,0,h);
        wall.addColorStop(0,cheese?'#4a362c':'#3c4440');
        wall.addColorStop(.65,cheese?'#b08050':'#775349');
        wall.addColorStop(1,'#382924');
        ctx.fillStyle=wall;
        ctx.fillRect(0,0,w,h);
        for(const x of [76,206,314]) {
          const light=ctx.createRadialGradient(x,57,1,x,60,83);
          light.addColorStop(0,'#fff2b8e0');
          light.addColorStop(1,'#edc28400');
          ctx.fillStyle=light;
          ctx.fillRect(x-90,0,180,150);
          ctx.fillStyle='#ffefbe';
          ctx.beginPath();
          ctx.arc(x,50,11,0,Math.PI*2);
          ctx.fill();
        }
        const palette=cheese?['#e9c171','#e9d19a','#da9a52','#edbc85','#af7245']:['#9b353a','#e5d2ab','#a25c54','#74726c','#aab5b6','#bb8944'];
        for(const y of variant===3?[156]:[151,225,295]) {
          for(let x=18;x<w-17;x+=cheese?27:18) {
            ctx.fillStyle=palette[Math.floor(random()*palette.length)];
            const height=(cheese?14:28)+random()*21;
            ctx.fillRect(x,y-height,cheese?22:14,height);
            ctx.fillStyle='#fbebba50';
            ctx.fillRect(x+3,y-height+5,cheese?15:8,3);
          }
          ctx.fillStyle='#2d2422';
          ctx.fillRect(0,y,w,9);
        }
        if(variant===3) {
          ctx.fillStyle='#d0ac8790';
          ctx.beginPath();ctx.moveTo(w*.38,169);ctx.lineTo(w*.62,169);ctx.lineTo(w*.90,h);ctx.lineTo(w*.10,h);ctx.fill();
          ctx.fillStyle='#6e504570';
          for(const y of [198,225,264,309]) ctx.fillRect(w*.16,y,w*.68,3);
        }
        ctx.fillStyle='#a6c6d217';
        ctx.beginPath();
        ctx.moveTo(0,110);ctx.lineTo(w,22);ctx.lineTo(w,80);ctx.lineTo(0,205);ctx.fill();
      });
    }

    function groupAt(x,z,heading=0) {
      const group=new T.Group();
      group.position.set(x,ground(x,z)+.14,z);
      group.rotation.y=heading;
      root.add(group);
      return group;
    }

    function plane(parent,w,h,x,y,z,material) {
      const mesh=new T.Mesh(new T.PlaneGeometry(w,h),material);
      mesh.position.set(x,y,z);
      parent.add(mesh);
      return mesh;
    }

    function storefront({x,z,heading,width,cheese,lettering}) {
      const facade=groupAt(x,z,heading),solids=new T.Group();
      facade.add(solids);
      const put=(w,h,d,x,y,z,material)=>box(solids,w,h,d,x,y,z,material);
      const frame=cheese?charcoal:steel,awning=cheese?blue:red;
      const displays=[0,1,2,3].map(variant=>display(cheese,variant)),cols=cheese?4:6,bay=(width-.45)/cols;
      put(width,3.5,.16,0,1.78,.09,frame);
      for(let i=0;i<cols;i++) {
        const u=(i-(cols-1)*.5)*bay,door=cheese?i===2:i===0||i===cols-1;
        const bottom=door?.15:.66;
        const height=2.78-bottom;
        plane(facade,bay-.13,height,u,bottom+height*.5,.184,displays[door?3:i%3]);
        put(.054,height,.075,u,bottom+height*.5,.211,frame);
        put(bay-.09,.072,.07,u,2.34,.217,frame);
        put(bay-.09,.095,.075,u,bottom,.212,frame);
        if(door) {
          put(.08,.30,.104,u-.14,1.13,.26,steel);
          put(bay-.15,.043,.07,u,1.05,.23,frame);
        } else put(bay-.13,.18,.23,u,.57,.20,cheese?charcoal:brick);
      }
      put(width+.2,.23,.4,0,3.68,.17,cheese?cream:brick);
      const awningTop=put(width+.27,.10,1.58,0,3.40,.70,awning);
      awningTop.rotation.x=.20;
      put(width+.27,.49,.095,0,3.11,1.45,awning);
      plane(facade,width*.82,.57,0,3.13,1.504,lettering);
      for(const u of [-width*.41,-width*.16,width*.16,width*.41]) {
        put(.13,.09,.12,u,3.00,1.06,warm);
      }
      if(!cheese) {
        put(width,1.48,.095,0,4.55,.068,brick);
        for(let i=0;i<=cols;i++) put(.12,1.48,.19,(i-cols*.5)*bay,4.55,.124,cream);
        put(width+.2,.16,.23,0,5.29,.125,cream);
      } else {
        put(.61,.98,.07,width*.36,.51,2.24,wood).rotation.x=-.28;
        put(.61,.98,.07,width*.36,.51,2.49,wood).rotation.x=.28;
        plane(facade,.55,.65,width*.36,.65,2.482,sign('CHEESE','WISCONSIN','#343a37','#f6e8bd')).rotation.x=-.28;
      }
      mergeLandmark(solids);
    }

    storefront({x:-1130.3,z:-14.75,heading:3.119,width:17.7,cheese:false,
      lettering:sign('the university book store','711 STATE STREET','#a62d35','#fff5e3',false,25.5)});
    storefront({x:-68.15,z:135.8,heading:2.372,width:9.6,cheese:true,
      lettering:sign('fromagination','ARTISANAL CHEESES & PERFECT COMPANIONS','#263a47','#fbedd6',true,13.8)});

    const {sites}=MadisonCampaign;
    for(const [name,x,z,facing,width] of [['studio',-559.45,256.69,.836,1.48],['workshop',722.96,-740.6,2.377,2.45]]) {
      const property=groupAt(x,z,facing);
      box(property,width,2.32,.17,0,1.18,.11,wood);
      box(property,width-.17,1.99,.05,0,1.16,.205,blue);
      box(property,.07,.12,.06,width*.28,1.09,.26,cream);
      box(property,width+.18,.14,.42,0,.09,.17,cream);
      plane(property,width*1.55,.44,0,2.57,.20,sign(sites[name].name,'ISTHMUS PROPERTIES','#253c40','#ffe8b4'));
    }

    const paving=batch(),stone=new T.Color(0xaea797);
    function terracePaved(x,z) { return x>-1262 && x<-1236 && z>-241 && z<-220; }
    for(let x=-1262;x<-1236;x+=2) for(let z=-241;z<-220;z+=3) {
      const at=(px,pz)=>[px,ground(px,pz)+.19,pz];
      paving.quad(at(x,z),at(x,z+3),at(x+2,z+3),at(x+2,z),stone,3,2);
    }
    const plaza=paving.mesh(pavingMaterial(true,true));
    plaza.receiveShadow=true;
    root.add(plaza);
    const terraceSet=new T.Group();
    root.add(terraceSet);
    const colors=[matte(0xcab643),matte(0xce662f),matte(0x587c51)];
    function tube(a,b,r,material) {
      const v=new T.Vector3().subVectors(b,a),center=a.clone().addScaledVector(v,.5);
      const mesh=cylinder(terraceSet,r,r,v.length(),center.x,center.y,center.z,material,8);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());
    }
    function chair(x,z,angle,color) {
      const y=ground(x,z)+.19;
      const p=(u,v,w)=>new T.Vector3(x+Math.cos(angle)*u+Math.sin(angle)*w,y+v,z-Math.sin(angle)*u+Math.cos(angle)*w);
      const seat=cylinder(terraceSet,.29,.29,.064,x,y+.47,z,color,16);
      seat.rotation.y=angle;
      for(const u of [-.21,.21]) for(const w of [-.20,.20]) tube(p(u,.02,w),p(u*.80,.47,w*.82),.024,color);
      for(const u of [-.23,.23]) tube(p(u,.48,-.16),p(u,.87,-.26),.025,color);
      const center=p(0,.86,-.28);
      const ring=new T.Mesh(new T.TorusGeometry(.227,.022,6,18),color);
      ring.position.copy(center);
      ring.rotation.y=angle;
      terraceSet.add(ring);
      for(let j=0;j<10;j++) {
        const a=j*Math.PI/5;
        tube(center,p(Math.cos(a)*.222,.86+Math.sin(a)*.222,-.28),.009,color);
      }
    }
    for(const [i,[x,z]] of [[-1256,-225],[-1245,-226],[-1255,-235],[-1242,-235]].entries()) {
      const y=ground(x,z)+.19;
      cylinder(terraceSet,.54,.54,.07,x,y+.75,z,colors[i%3],24);
      cylinder(terraceSet,.036,.21,.71,x,y+.37,z,colors[i%3],12);
      for(let c=0;c<3;c++) {
        const angle=c*Math.PI*2/3+i*.47;
        chair(x+Math.sin(angle)*.89,z+Math.cos(angle)*.89,angle+Math.PI,colors[(i+c)%3]);
      }
    }
    const seat=MadisonCampaign.terraceSeat;
    chair(seat.x,seat.z,Math.PI-seat.yaw,colors[1]);
    mergeLandmark(terraceSet);

    const desks=new T.Group();
    root.add(desks);
    for(const [id,title] of [['union','WELCOME TABLE'],['monona','COMMUNITY TABLE'],['park','LITTLE LIBRARY'],['field','CREW CHECK-IN']]) {
      const {x,z}=sites[id],desk=groupAt(x-2.2,z+1.65,.15);
      const top=box(desk,1.43,.079,.68,0,.93,0,wood);
      desks.attach(top);
      for(const a of [-.62,.62]) for(const b of [-.25,.25]) desks.attach(box(desk,.072,.90,.072,a,.48,b,wood));
      desks.attach(box(desk,.45,.19,.42,-.38,1.07,.08,cream));
      plane(desk,1.27,.30,0,.70,.357,sign(title,'','#ece0bb','#273a3a'));
    }
    mergeLandmark(desks);

    const boats=[];
    const sail=matte(0xfff2d6);
    for(let i=0;i<3;i++) {
      const boat=new T.Group();
      const hull=new T.Mesh(new T.SphereGeometry(1,12,7),[red,blue,cream][i]);
      hull.scale.set(.82,.39,2.36);
      hull.position.y=.18;
      boat.add(hull);
      cylinder(boat,.042,.045,5.29,0,2.77,-.37,steel,8);
      const rig=batch(),cloth=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
      const white=new T.Color(0xffe9c4),stripe=new T.Color([0xc85d38,0x788e98,0xc9a852][i]);
      rig.triangle([0,5.24,-.36],[.07,1.38,-.36],[.18,1.38,1.67],white);
      rig.triangle([0,4.46,-.43],[.025,1.30,-.46],[-.09,1.27,-2.13],stripe);
      boat.add(rig.mesh(cloth));
      box(boat,1.03,.085,2.21,0,.43,.10,sail);
      root.add(boat);
      boats.push(boat);
    }

    const marker=new T.Group();
    const body=new T.Mesh(new T.OctahedronGeometry(.57),new T.MeshBasicMaterial({color:0xffcd7f}));
    marker.add(body);
    const footing=new T.Mesh(new T.RingGeometry(.75,.84,26).rotateX(-Math.PI/2),
      new T.MeshBasicMaterial({color:0xffcd7f,side:T.DoubleSide}));
    marker.add(footing);
    root.add(marker);
    marker.visible=false;
    function target(site) {
      marker.visible=Boolean(site);
      if(site) marker.position.set(site.x,ground(site.x,site.z)+.3,site.z);
    }
    function update(time) {
      body.position.y=2.65+Math.sin(time*2.6)*.17;
      body.rotation.y=time*.85;
      for(const [i,boat] of boats.entries()) {
        const phase=time*.009+i*2.099;
        boat.position.set(-1240+128*Math.cos(phase),3.4+Math.sin(time*1.8+i)*.075,-383+59*Math.sin(phase));
        boat.rotation.set(Math.sin(time*1.3+i)*.025,Math.atan2(-128*Math.sin(phase),59*Math.cos(phase)),Math.cos(time*1.5+i)*.09,'YXZ');
      }
    }
    return {target,update,paved:terracePaved,light:evening=>{ warm.emissiveIntensity=.22+evening*.62; }};
  }

  window.MadisonStorefronts={create};
})();
