(() => {
  'use strict';

  const T=THREE;

  function sidewalks(geo,shelters) {
    const road=geo.data.roads.filter(([name,kind])=>name==='State Street' && kind===2)
      .flatMap(([, ,width,,points])=>points.slice(1).map((b,i)=>({a:points[i],b,width})));
    const lanes=[];
    for(const side of [-1,1]) {
      let points=[];
      function finish() {
        if(points.length>16) lanes.push({side,points});
        points=[];
      }
      for(let x=-1000;x<=-194;x+=2) {
        const edge=road.find(({a,b,width})=>width>=7 && x>=Math.min(a[0],b[0]) && x<=Math.max(a[0],b[0]));
        if(!edge) { finish(); continue; }
        const {a,b,width}=edge,t=(x-a[0])/(b[0]-a[0]);
        const center=a[1]+(b[1]-a[1])*t;
        const offsets=[1.10,.80,1.41,.51,1.65];
        const offset=offsets.find(n=>{
          const z=center+side*(width/2+n);
          return !geo.inBuilding(x,z,.27) && !shelters.some(s=>s.blocks(x,z));
        });
        if(offset===undefined) { finish(); continue; }
        points.push([x,center+side*(width/2+offset)]);
      }
      finish();
    }
    return lanes;
  }

  function create(scene,geo,layout) {
    const shelters=layout.stops.filter(([name])=>name==='State Street').map(([,x,z,dx,dz])=>{
      const position=(px,pz)=>[(px-x)*dx+(pz-z)*dz,(px-x)*dz-(pz-z)*dx];
      return {
        blocks(px,pz) {
          const [along,across]=position(px,pz);
          return along>-6.05 && along<3.0 && Math.abs(across+1)<.37 ||
            Math.abs(along-6.13)<.86 && Math.abs(across+.67)<.34;
        },
        lift(px,pz) {
          const [along,across]=position(px,pz);
          return Math.abs(along)<9.74 && Math.abs(across)<1.50?.329:0;
        }
      };
    });
    const rng=geo.random(70433),walkers=[];
    for(const {side,points} of sidewalks(geo,shelters)) {
      const distance=points.at(-1)[0]-points[0][0];
      const count=Math.floor(distance/(side>0?35:38));
      for(let i=0;i<count;i++) {
        const offset=(i+.24+rng()*.52)*distance/count;
        const direction=i%2===0?1:-1;
        const jacket=[0x913f38,0x45768b,0x8b8062,0x4c6450,0x4a4965,0xb06b46,0xa5a69d,0x6f3d53];
        const trousers=[0x333b48,0x403e42,0x554942,0x496473,0x6d5b52];
        const skin=[0xbd8560,0xa96848,0xd5a180,0x7e523c,0xe7b594,0xa17760];
        function person(along,companion) {
          walkers.push({side,points,distance,along,direction,height:.85+rng()*.22,phase:rng()*Math.PI*2,
            pace:1.04+rng()*.41,lateral:companion?.39:-.22,progress:1,
            jacket:new T.Color(jacket[Math.floor(rng()*jacket.length)]),
            trousers:new T.Color(trousers[Math.floor(rng()*trousers.length)]),
            skin:new T.Color(skin[Math.floor(rng()*skin.length)]),
            hair:new T.Color(rng()<.28?0x776650:0x332c2a),bag:rng()<.34});
        }
        person(offset,false);
        if(rng()<.31 && offset+1.47<distance) person(offset+1.47,true);
      }
    }
    if(!walkers.length) return ()=>{};
    const crossings=layout.signals.filter(({x,z})=>x>=-1004&&x<=-191&&Math.abs(z-(.021*x-1.8))<11)
      .map(signal=>({signal,axis:Math.abs(signal.axes[0].dx)>Math.abs(signal.axes[1].dx)?0:1}));
    const matte=new T.MeshLambertMaterial();
    function parts(geometry,count,material=matte) {
      const mesh=new T.InstancedMesh(geometry,material,count);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled=false;
      mesh.count=0;
      scene.add(mesh);
      return mesh;
    }
    const torso=parts(new T.CapsuleGeometry(.19,.19,3,9),walkers.length);
    const head=parts(new T.SphereGeometry(.122,10,7),walkers.length);
    const hair=parts(new T.SphereGeometry(.125,9,6,0,Math.PI*2,0,Math.PI*.59),walkers.length);
    const legs=parts(new T.CapsuleGeometry(.058,.585,3,7),walkers.length*2);
    const arms=parts(new T.CapsuleGeometry(.048,.44,3,7),walkers.length*2);
    const shoes=parts(new T.SphereGeometry(1,8,5),walkers.length*2);
    const bags=parts(new T.CapsuleGeometry(.133,.19,3,8),walkers.length);
    const shadowSize=10,shadowInk=document.createElement('canvas');
    shadowInk.width=shadowInk.height=shadowSize;
    const ink=shadowInk.getContext('2d');
    const soft=ink.createRadialGradient(5,5,.1,5,5,5);
    soft.addColorStop(0,'#2b283382');
    soft.addColorStop(1,'#2b283300');
    ink.fillStyle=soft;
    ink.fillRect(0,0,shadowSize,shadowSize);
    const shade=parts(new T.PlaneGeometry(.95,.66).rotateX(-Math.PI/2),walkers.length,
      new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowInk),transparent:true,depthWrite:false}));
    const motions=[torso,head,hair,legs,arms,shoes,bags,shade];
    const step=new T.Object3D();
    const bagColor=new T.Color(0x52564e),shoeColor=new T.Color(0x383838);
    let lastTime;
    return (seconds,camera,reduced)=>{
      const dt=lastTime===undefined?0:Math.min(.2,Math.max(0,seconds-lastTime));
      lastTime=seconds;
      for(const mesh of motions) mesh.count=0;
      for(const walker of walkers) {
        const {points,height,pace,side}=walker;
        const px=points[0][0]+walker.along;
        const cross=crossings.find(({signal})=>{
          const distance=(signal.x-px)*walker.direction;
          return distance>=6.4 && distance<8.2;
        });
        const walking=!cross || MadisonTraffic.signalPhase(cross.signal,cross.axis,seconds)<MadisonTraffic.green;
        walker.progress+=(Number(walking)-walker.progress)*Math.min(1,dt*8);
        walker.along+=walker.direction*pace*walker.progress*dt;
        if(walker.along<=0 || walker.along>=walker.distance) {
          walker.along=geo.clamp(walker.along,0,walker.distance);
          walker.direction*=-1;
        }
        walker.phase+=pace*dt*7.0*walker.progress;
        const index=Math.min(points.length-2,Math.floor(walker.along/2)),t=(walker.along-index*2)*.5;
        const [x0,z0]=points[index],[x1,z1]=points[index+1];
        const x=x0+(x1-x0)*t,mid=z0+(z1-z0)*t;
        let z=mid+walker.lateral*side;
        if(geo.inBuilding(x,z,.23) || shelters.some(s=>s.blocks(x,z))) z=mid;
        if(Math.hypot(x-camera.position.x,z-camera.position.z)>(reduced?220:360) || camera.position.y>geo.ground(x,z)+320) continue;
        const ground=geo.ground(x,z),y=ground+.095+Math.max(0,...shelters.map(s=>s.lift(x,z)));
        const dx=walker.direction,dz=(z1-z0)*dx*.5,yaw=Math.atan2(dx,dz);
        const swing=Math.sin(walker.phase)*walker.progress;
        const bob=Math.abs(Math.cos(walker.phase))*.036*walker.progress;
        function place(mesh,across,up,along,rx,sx,sy,sz,color) {
          step.position.set(x+height*(across*Math.cos(yaw)+along*Math.sin(yaw)),y+up*height,
            z+height*(-across*Math.sin(yaw)+along*Math.cos(yaw)));
          step.rotation.set(rx,yaw,0,'YXZ');
          step.scale.set(sx*height,sy*height,sz*height);
          step.updateMatrix();
          const pick=mesh.count++;
          mesh.setMatrixAt(pick,step.matrix);
          if(color) mesh.setColorAt(pick,color);
        }
        place(torso,0,1.23+bob,0,.03,1.02,1.01,.67,walker.jacket);
        place(head,0,1.625+bob,.015,0,.92,1.05,.95,walker.skin);
        place(hair,0,1.657+bob,.007,0,.93,.83,.99,walker.hair);
        if(walker.bag) place(bags,0,1.21+bob,-.177,.04,1,.84,.53,bagColor);
        for(const side of [-1,1]) {
          const stride=side*swing*.38,leg=Math.sin(stride);
          place(legs,side*.101,.89+bob-.35*Math.cos(stride),leg*.35,-stride,1,1,1,walker.trousers);
          place(shoes,side*.105,.083+Math.max(0,leg)*.14+bob,leg*.67+.055,0,.074,.055,.143,shoeColor);
          place(arms,side*.218,1.39+bob-.25*Math.cos(stride),-leg*.22,stride*.90,.90,1,.93,walker.jacket);
        }
        place(shade,0,.012,0,0,1,1,1);
      }
      for(const mesh of motions) {
        if(!mesh.count) continue;
        mesh.instanceMatrix.needsUpdate=true;
        if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
      }
    };
  }

  window.MadisonPedestrians={create};
})();
