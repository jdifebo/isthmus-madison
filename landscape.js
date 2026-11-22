(() => {
  'use strict';

  const T=THREE;
  const profiles=[
    {height:18,radius:6.4,spread:1,shape:.42,leaf:0x789647},
    {height:17,radius:5.3,spread:.89,shape:.44,leaf:0x8caa55},
    {height:21,radius:6.9,spread:1.04,shape:.45,leaf:0x648b46},
    {height:19,radius:4.2,spread:.68,shape:.48,leaf:0x426750},
    {height:10,radius:4.7,spread:.94,shape:.37,leaf:0x739452}
  ];

  function leafTexture(random) {
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=256;
    const ink=canvas.getContext('2d');
    const rng=random(29235);
    // Layers of leaves curl around several centers, with gaps between the sprays.
    const centers=[[.47,.50,.30],[.28,.43,.17],[.69,.44,.19],[.56,.71,.21],[.51,.24,.17],[.30,.63,.12]];
    for(let layer=0;layer<3;layer++) {
      for(const [cx,cy,spread] of centers) {
        for(let i=0;i<61;i++) {
          const a=rng()*Math.PI*2,r=Math.sqrt(rng())*spread;
          const x=(cx+Math.cos(a)*r)*256,y=(cy+Math.sin(a)*r*.83)*256;
          const length=(8+rng()*12)*(1-layer*.13), width=length*(.26+rng()*.23);
          const brightness=Math.round(113+layer*35+rng()*46);
          ink.save();
          ink.translate(x,y);
          ink.rotate(rng()*Math.PI);
          ink.beginPath();
          ink.moveTo(-length*.65,0);
          ink.quadraticCurveTo(-length*.04,-width,length*.62,0);
          ink.quadraticCurveTo(length*.16,width*.93,-length*.65,0);
          ink.fillStyle='rgb('+brightness+','+Math.min(255,brightness+12)+','+Math.max(0,brightness-25)+')';
          ink.fill();
          if(layer>0) {
            ink.strokeStyle='#fff2a33b';
            ink.lineWidth=.55;
            ink.beginPath();
            ink.moveTo(-length*.42,0);
            ink.lineTo(length*.46,0);
            ink.stroke();
          }
          ink.restore();
        }
      }
    }
    const texture=new T.CanvasTexture(canvas);
    texture.colorSpace=T.SRGBColorSpace;
    texture.anisotropy=4;
    return texture;
  }

  function windMaterial(options,clock,strength) {
    const material=new T.MeshLambertMaterial(options);
    material.customProgramCacheKey=()=>String(strength);
    material.onBeforeCompile=shader=>{
      shader.uniforms.wind=clock;
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`
        #include <common>
        uniform float wind;
      `).replace('#include <begin_vertex>',`
        #include <begin_vertex>
        vec3 planted=instanceMatrix[3].xyz;
        float height=max(0.,position.y);
        float gust=sin(planted.x*.12+planted.z*.10+wind*1.24)*.68
          +sin(planted.z*.30-wind*2.26)*.32;
        transformed.x+=gust*height*height*`+strength+`;
        transformed.z+=gust*height*height*`+(strength*.48)+`;
      `);
    };
    return material;
  }

  function treeTemplate(type,geo,materials) {
    const {random,batch}=geo,profile=profiles[type],rng=random(3531+type*647);
    const bark=batch(),croft=batch(),silhouettes=batch(),shaped=batch(),normals=[],shapedNormals=[];
    const color=new T.Color(0xffffff);
    function branch(a,b,lower,upper) {
      const line=new T.Vector3().subVectors(b,a).normalize();
      const perp=new T.Vector3(1,0,0).cross(line).normalize();
      const up=new T.Vector3().crossVectors(line,perp).normalize();
      const sides=8;
      for(let side=0;side<sides;side++) {
        const angle=side*Math.PI*2/sides,next=(side+1)*Math.PI*2/sides;
        const offset=(origin,r,theta)=>origin.clone().addScaledVector(perp,Math.cos(theta)*r)
          .addScaledVector(up,Math.sin(theta)*r).toArray();
        const light=.84+Math.sin(angle+1.3)*.08;
        color.setRGB(.67*light,.59*light,.49*light);
        bark.quad(offset(a,lower,angle),offset(a,lower,next),offset(b,upper,next),offset(b,upper,angle),
          color,1/sides,b.distanceTo(a),a.y,side/sides);
      }
    }
    const foot=new T.Vector3(0,-.012,0),fork=new T.Vector3(.028,.34,-.03),peak=new T.Vector3(-.07,.81,.055);
    branch(foot,fork,.072,.049);
    branch(fork,peak,.049,.013);
    const clusters=[
      [0,.83,0,.52,profile.shape*.55],
      [-.14,.71,.12,.47,profile.shape*.59]
    ];
    for(let c=0;c<(type===3?8:11);c++) {
      const angle=c*2.4, tier=c%3;
      const spread=profile.spread*(type===3?.36+(2-tier)*.14:.49+.16*rng());
      const x=Math.cos(angle)*spread,z=Math.sin(angle)*spread,y=.58+tier*.105+rng()*.045;
      const start=new T.Vector3(.012,.33+tier*.079,-.012);
      const end=new T.Vector3(x*.89,y,z*.89);
      branch(start,end,.030-tier*.005,.008);
      const r=.31+rng()*.24+(type===2?.07:0);
      clusters.push([x,y,z,r,profile.shape*(.38+rng()*.19)]);
    }

    if(type===3) {
      for(let tier=0;tier<4;tier++) clusters.push([0,.46+tier*.157,0,.88-tier*.19,.129]);
    }
    const outline=new T.IcosahedronGeometry(1,0), vertices=outline.getAttribute('position');
    const detailed=new T.IcosahedronGeometry(1,1), smooth=detailed.getAttribute('position');
    function lobes(out,normal,points,x,y,z,r,h,tint,ruffle) {
      function bulge(i) {
        const vx=points.getX(i),vy=points.getY(i),vz=points.getZ(i);
        const bumps=ruffle ? 1+.14*Math.sin(vx*13.7+vz*9.7)*Math.cos(vy*10.5-vz*6.2) : 1;
        const nx=vx/r,ny=vy/h,nz=vz/r,scale=1/Math.hypot(nx,ny,nz);
        normal.push(nx*scale,ny*scale,nz*scale);
        return [x+vx*r*.84*bumps,y+vy*h*.82*bumps,z+vz*r*.84*bumps];
      }
      for(let i=0;i<points.count;i+=3) out.triangle(bulge(i),bulge(i+1),bulge(i+2),tint);
    }
    for(const [index,[x,y,z,r,h]] of clusters.entries()) {
      const leafColor=new T.Color().setScalar(.57+rng()*.22);
      if(index<2 || index%2===0) {
        lobes(silhouettes,normals,vertices,x,y,z,r,h,leafColor,false);
        lobes(shaped,shapedNormals,smooth,x,y,z,r,h,leafColor,true);
      }
      const tint=new T.Color().setScalar(.77+rng()*.19);
      for(let card=0;card<3;card++) {
        const angle=card*Math.PI/3+rng()*.22;
        const ex=Math.cos(angle)*r,ez=Math.sin(angle)*r;
        const collapse=(card===2?.42:.21)*r;
        croft.quad([x-ex,y-h,z-ez],[x+ex,y-h,z+ez],
          [x+ex-ez*collapse,y+h,z+ez+ex*collapse],[x-ex-ez*collapse,y+h,z-ez+ex*collapse],tint);
      }
    }
    outline.dispose();
    detailed.dispose();
    const canopy=silhouettes.mesh(materials.distant).geometry;
    canopy.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    const texturedCanopy=shaped.mesh(materials.distant).geometry;
    texturedCanopy.setAttribute('normal',new T.Float32BufferAttribute(shapedNormals,3));
    return {
      bark:bark.mesh(materials.bark).geometry,
      leaves:croft.mesh(materials.leaves).geometry,
      distant:canopy,
      close:texturedCanopy
    };
  }

  function treeGroves(scene,geo,clock) {
    const {data,ground,inBuilding,onWater,random,clamp}=geo;
    const [west,north,east,south]=data.bounds;
    const rng=random(819408),groves=new Map();
    function plant(x,z,diameter,type) {
      if(x<west || x>east || z<north || z>south || inBuilding(x,z,.80) || onWater(x,z)) return;
      const profile=profiles[type],jitter=rng();
      const maturity=Math.sqrt(Math.max(2,diameter || 8+rng()*9)/39);
      const height=clamp(profile.height*(.31+maturity*.67)*(.82+rng()*.36),3.3,profile.height*1.15);
      const radius=clamp(profile.radius*(.25+maturity*.67)*(.82+rng()*.43),1.04,profile.radius*1.13);
      const key=Math.floor(x/130)+','+Math.floor(z/130)+','+type;
      if(!groves.has(key)) groves.set(key,{type,entries:[]});
      groves.get(key).entries.push([x,ground(x,z),z,height,radius,jitter]);
    }
    for(const [x,z,diameter,type] of data.trees) plant(x,z,diameter,type ?? 0);
    for(const [x,z] of [[-78,30],[-79,-31],[-34,76],[39,72],[78,30],[72,-36],[35,-78],[-32,-76]]) {
      plant(x,z,27+Math.round(rng()*7),rng()<.44?2:0);
    }

    const bark=new T.MeshLambertMaterial({vertexColors:true,color:0xb4a68c});
    bark.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 barkUV;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nbarkUV=uv;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 barkUV;')
        .replace('#include <color_fragment>',`
          #include <color_fragment>
          float grain=(barkUV.x+.005*sin(barkUV.y*41.)+.008*sin(barkUV.y*16.))*119.38;
          float ridges=sin(grain)+.40*sin(grain*2.)+.17*sin(grain*6.);
          float fissure=smoothstep(.65,1.20,ridges)*(.65+.35*sin(barkUV.y*94.+grain));
          diffuseColor.rgb*=.87+.15*sin(grain*.53)*sin(barkUV.y*12.+grain)-fissure*.37;
        `);
    };
    const distant=new T.MeshLambertMaterial({vertexColors:true,color:0xffffff});
    distant.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 leavesWorld;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nleavesWorld=(instanceMatrix*vec4(position,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 leavesWorld;')
        .replace('#include <color_fragment>',`
          #include <color_fragment>
          float patches=.5+.28*sin(dot(leavesWorld,vec3(6.8,2.2,3.1)))+.20*cos(dot(leavesWorld,vec3(3.2,8.1,-4.4)));
          float spots=fract(sin(dot(floor(leavesWorld*8.),vec3(39.03,17.24,59.5)))*41767.52);
          float closeup=1.-smoothstep(18.,63.,distance(cameraPosition,leavesWorld));
          diffuseColor.rgb*=1.+closeup*(-.33+patches*.36+spots*.24);
        `);
    };
    const leaves=windMaterial({vertexColors:true,map:leafTexture(random),alphaTest:.36,side:T.DoubleSide},clock,.068);
    const materials={bark,distant,leaves};
    const templates=profiles.map((_,type)=>treeTemplate(type,geo,materials));
    const clusters=[];
    const transform=new T.Object3D(), tint=new T.Color();
    for(const {type,entries} of groves.values()) {
      const template=templates[type];
      const near=new T.InstancedMesh(template.leaves,leaves,entries.length);
      const branches=new T.InstancedMesh(template.bark,bark,entries.length);
      const crowns=new T.InstancedMesh(template.distant,distant,entries.length);
      const shaped=new T.InstancedMesh(template.close,distant,entries.length);
      crowns.castShadow=true;
      shaped.castShadow=true;
      for(let index=0;index<entries.length;index++) {
        const [x,y,z,height,r,seed]=entries[index];
        transform.position.set(x,y,z);
        transform.scale.set(r,height,r*(.86+seed*.31));
        transform.rotation.y=seed*Math.PI*2;
        transform.updateMatrix();
        for(const mesh of [near,branches,crowns,shaped]) mesh.setMatrixAt(index,transform.matrix);
        tint.set(profiles[type].leaf).offsetHSL((seed-.5)*.044,.041-seed*.098,(seed-.5)*.173);
        near.setColorAt(index,tint);
        crowns.setColorAt(index,tint.clone().multiplyScalar(.91));
        shaped.setColorAt(index,tint.clone().multiplyScalar(.99));
      }
      crowns.computeBoundingSphere();
      crowns.userData.range=1520;
      near.visible=branches.visible=shaped.visible=false;
      const {center,radius}=crowns.boundingSphere;
      clusters.push({near,branches,crowns,shaped,center,radius});
      scene.add(crowns,branches,near,shaped);
    }
    return (x,z,height,reduced)=>{
      const range=reduced?132:215;
      for(const {near,branches,crowns,shaped,center,radius} of clusters) {
        const delta=(x-center.x)**2+(z-center.z)**2;
        near.visible=height<80 && delta<(range+radius)**2;
        branches.visible=height<100 && delta<(range+radius+40)**2;
        shaped.visible=height<35 && delta<((reduced?48:78)+radius*.77)**2;
        if(shaped.visible) crowns.visible=false;
      }
    };
  }

  function canopyColor(photos,bounds) {
    if(!photos.available) return ()=>false;
    const canvas=document.createElement('canvas');
    canvas.width=1024;
    canvas.height=650;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(photos.detail.image,0,0,canvas.width,canvas.height);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    const water=document.createElement('canvas');
    water.width=canvas.width;
    water.height=canvas.height;
    const shoreline=water.getContext('2d',{willReadFrequently:true});
    shoreline.drawImage(photos.waterMask.image,0,0,water.width,water.height);
    const waterPixels=shoreline.getImageData(0,0,water.width,water.height).data;
    const [west,north,east,south]=bounds;
    return (x,z)=>{
      const a=Math.floor((x-west)/(east-west)*canvas.width);
      const b=Math.floor((z-north)/(south-north)*canvas.height);
      if(a<0 || a>=canvas.width || b<0 || b>=canvas.height) return false;
      const index=(a+b*canvas.width)*4;
      if(waterPixels[index+3]>70) return false;
      const r=pixels[index],g=pixels[index+1],blue=pixels[index+2];
      return g>53 && g>r*1.035 && g>blue*1.16;
    };
  }

  function grass(scene,geo,photos,clock,paved) {
    const {data,nearestRoad,inBuilding,random,ground,batch}=geo;
    const green=canopyColor(photos,data.bounds);
    const material=windMaterial({vertexColors:true,side:T.DoubleSide},clock,.39);
    const blades=batch(),rng=random(68730);
    for(let i=0;i<8;i++) {
      const a=i*2.39,x=Math.cos(a)*rng()*.24,z=Math.sin(a)*rng()*.24;
      const width=.009+rng()*.016, height=i<2?.16+rng()*.105:.067+rng()*.108;
      const sx=Math.cos(a)*width,sz=Math.sin(a)*width;
      const lean=.052+rng()*.046;
      const color=new T.Color().setScalar(.70+rng()*.29);
      const a0=[x-sx,0,z-sz],b0=[x+sx,0,z+sz];
      const a1=[x-sx*.57,height*.57,z-sz*.57],b1=[x+sx*.57,height*.57,z+sz*.57];
      blades.quad(a0,b0,b1,a1,color);
      blades.triangle(a1,b1,[x+Math.sin(a)*lean,height,z+Math.cos(a)*lean],color.clone().multiplyScalar(1.21));
    }
    const meadow=new T.InstancedMesh(blades.mesh(material).geometry,material,4900);
    meadow.count=0;
    meadow.frustumCulled=false;
    meadow.receiveShadow=true;
    scene.add(meadow);
    const object=new T.Object3D();
    const tint=new T.Color();
    const memo=new Map();
    function grows(x,z) {
      const capitol=Math.abs(x)<99 && Math.abs(z)<92 && Math.abs(x+4)>15 && Math.abs(z)>15;
      if(!capitol && !green(x,z)) return false;
      if(paved(x,z) || inBuilding(x,z,.28)) return false;
      const road=nearestRoad(x,z);
      return !road || road.distance>road.width*.5+(road.kind<=2?2.02:.30);
    }
    function patch(i,j) {
      const key=i+','+j;
      if(memo.has(key)) return memo.get(key);
      const rng=random((i*45991)^(j*98171)^0x240133);
      const entries=[];
      for(let b=0;b<152;b++) {
        const x=(i+rng())*9,z=(j+rng())*9;
        if(!grows(x,z)) continue;
        entries.push([x,ground(x,z)+.013,z,rng(),rng()]);
      }
      if(memo.size>365) memo.delete(memo.keys().next().value);
      memo.set(key,entries);
      return entries;
    }
    let lastX,lastZ,lastQuality;
    return (x,z,height,reduced)=>{
      meadow.visible=height<22;
      if(!meadow.visible) return;
      const i=Math.floor(x/9),j=Math.floor(z/9);
      if(i===lastX && j===lastZ && reduced===lastQuality) return;
      lastX=i; lastZ=j; lastQuality=reduced;
      const radius=reduced?3:5,distance=(radius+.41)**2*81;
      const offsets=[];
      for(let a=-radius;a<=radius;a++) for(let b=-radius;b<=radius;b++) offsets.push([a,b,a*a+b*b]);
      offsets.sort((a,b)=>a[2]-b[2]);
      let index=0;
      for(const [a,b] of offsets) {
        for(const [px,py,pz,seed,color] of patch(i+a,j+b)) {
          const away=(px-x)**2+(pz-z)**2;
          if(away>distance || index>=meadow.instanceMatrix.count || away>560 && seed<.49) continue;
          object.position.set(px,py,pz);
          object.rotation.y=seed*6.283;
          object.scale.set(.66+seed*.71,.63+color*.89,.66+seed*.71);
          object.updateMatrix();
          meadow.setMatrixAt(index,object.matrix);
          meadow.setColorAt(index++,tint.setHSL(.182+color*.073,.37+seed*.12,.25+color*.084));
        }
      }
      meadow.count=index;
      meadow.instanceMatrix.needsUpdate=true;
      if(meadow.instanceColor) meadow.instanceColor.needsUpdate=true;
    };
  }

  function frontGardens(scene,geo,plantings,clock) {
    const {ground,random,batch}=geo;
    const rng=random(27333), shrub=new T.IcosahedronGeometry(1,1);
    const positions=shrub.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      const bulge=1+.14*Math.sin(x*13.8+z*6.1)*Math.cos(y*10-z*3.4);
      positions.setXYZ(i,x*bulge,y*bulge,z*bulge);
    }
    const flower=batch(),leaf=new T.Color(0x558447),petal=new T.Color(0xe4c6ac);
    for(let n=0;n<6;n++) {
      const angle=n*2.399,x=Math.sin(angle)*.18,z=Math.cos(angle)*.18,h=.27+rng()*.27;
      flower.triangle([0,0,0],[x,h,z],[x+.019,h-.01,z+.022],leaf);
      const center=[x,h,z];
      for(let k=0;k<5;k++) {
        const a=k*Math.PI*2/5;
        flower.triangle(center,[x+Math.cos(a)*.064,h+.032,z+Math.sin(a)*.064],
          [x+Math.cos(a+.8)*.065,h+.019,z+Math.sin(a+.8)*.065],petal);
      }
    }
    const shrubMaterial=new T.MeshLambertMaterial(),petals=windMaterial({vertexColors:true,side:T.DoubleSide},clock,.14);
    const bloomGeometry=flower.mesh(petals).geometry;
    const groups=new Map();
    for(const detail of plantings) {
      const [x,z,,seed]=detail,kind=seed>.54?'shrubs':'flowers';
      const key=Math.floor(x/140)+','+Math.floor(z/140)+','+kind;
      if(!groups.has(key)) groups.set(key,{kind,items:[]});
      groups.get(key).items.push(detail);
    }
    const dummy=new T.Object3D(), color=new T.Color();
    for(const {kind,items} of groups.values()) {
      const isShrub=kind==='shrubs';
      const mesh=new T.InstancedMesh(isShrub?shrub:bloomGeometry,isShrub?shrubMaterial:petals,items.length);
      for(let i=0;i<items.length;i++) {
        const [x,z,r,seed]=items[i];
        dummy.position.set(x,ground(x,z)+(isShrub?r*.51:.12),z);
        dummy.rotation.y=seed*11.7;
        dummy.scale.set(isShrub?r:1.25,isShrub?r*.68:1.18,isShrub?r*.82:1.29);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
        mesh.setColorAt(i,isShrub?color.set(0x4f7137).offsetHSL((seed-.72)*.22,0,(seed-.72)*.24):
          color.set([0xf5c98f,0xe3a97f,0xddd5f1,0xe1adb7][Math.floor(seed*7)]));
      }
      mesh.computeBoundingSphere();
      mesh.userData.range=310;
      scene.add(mesh);
    }
  }

  function gardenBeds(scene,geo) {
    const {ground,batch,random,box,mergeLandmark}=geo;
    const rng=random(14389);
    const soil=batch(),flowers=batch();
    const locations=[
      [-72,-19,5.2,1.37],[-71,20,5.2,1.46],[-21,-75,1.48,5.3],[18,-75,1.42,5.3],
      [72,-19,4.8,1.38],[71,21,5.3,1.40],[-20,73,1.62,5.5],[19,73,1.53,5.4]
    ];
    for(const [x,z,rx,rz] of locations) {
      const ring=Array.from({length:26},(_,i)=>[x+Math.cos(i*Math.PI/13)*rx,z+Math.sin(i*Math.PI/13)*rz]);
      const middle=[x,ground(x,z)+.076,z];
      for(let i=0;i<ring.length;i++) {
        const p=(index)=>[ring[index][0],ground(...ring[index])+.092,ring[index][1]];
        soil.triangle(middle,p((i+1)%ring.length),p(i),new T.Color(0x3e3129).multiplyScalar(.74+rng()*.39));
      }
      for(let i=0;i<111;i++) {
        const a=rng()*Math.PI*2,r=Math.sqrt(rng())*.93;
        const px=x+Math.cos(a)*r*rx,pz=z+Math.sin(a)*r*rz,py=ground(px,pz)+.06;
        const stem=new T.Color(0x516b38).multiplyScalar(.81+rng()*.42);
        const h=.20+rng()*.55, angle=rng()*Math.PI*2;
        const swayX=Math.cos(angle)*.07,swayZ=Math.sin(angle)*.07;
        flowers.triangle([px-.018,py,pz],[px+.021,py,pz],[px+swayX,py+h,pz+swayZ],stem);
        flowers.triangle([px,py+.09,pz],[px+Math.sin(angle)*.15,py+h*.5,pz+Math.cos(angle)*.14],
          [px+swayX*.6,py+h*.65,pz+swayZ*.62],stem.clone().multiplyScalar(1.18));
        const blossom=new T.Color([0xe5a748,0xc8a2d7,0xe5d4b3,0xb77293,0xf0bd66][Math.floor(rng()*5)]);
        const top=[px+swayX,py+h,pz+swayZ];
        for(let petal=0;petal<5;petal++) {
          const angle=petal*2*Math.PI/5, radius=.026+rng()*.04;
          const center=[top[0]+Math.cos(angle)*radius,top[1]+.021,top[2]+Math.sin(angle)*radius];
          flowers.triangle(top,[center[0]+.027,center[1],center[2]-.016],
            [center[0]-.022,center[1]+.019,center[2]+.023],blossom);
        }
      }
    }
    const groundMesh=soil.mesh(new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide}));
    const gardenMesh=flowers.mesh(new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide}));
    groundMesh.receiveShadow=gardenMesh.receiveShadow=true;
    scene.add(groundMesh,gardenMesh);
    const furnishings=new T.Group();
    const wood=new T.MeshLambertMaterial({color:0x92684d});
    const iron=new T.MeshLambertMaterial({color:0x45504a});
    for(const [x,z,angle] of [[-81,24,0],[-80,-25,Math.PI],[-25,-80,Math.PI/2],[25,-80,-Math.PI/2],
      [82,26,Math.PI],[-89,47,Math.PI/2],[132,-778,-.7]]) {
      const bench=new T.Group();
      bench.position.set(x,ground(x,z),z);
      bench.rotation.y=angle;
      furnishings.add(bench);
      for(const ix of [-.77,.77]) {
        box(bench,.095,.55,.55,ix,.245,0,iron);
        box(bench,.07,.55,.06,ix,.67,.29,iron);
      }
      for(const slat of [-.19,-.055,.08,.215]) box(bench,1.93,.052,.11,0,.53,slat,wood);
      for(const sy of [.73,.88]) box(bench,1.93,.091,.06,0,sy,.285,wood);
    }
    mergeLandmark(furnishings);
    scene.add(furnishings);
  }

  function create(scene,geo,photos,clock,homes) {
    const updateTrees=treeGroves(scene,geo,clock);
    const updateGrass=grass(scene,geo,photos,clock,homes.paved);
    frontGardens(scene,geo,homes.plantings,clock);
    gardenBeds(scene,geo);
    return (player,camera,reduced)=>{
      const [x,z,altitude]=player || [camera.position.x,camera.position.z,camera.position.y];
      const height=altitude?altitude-geo.ground(x,z):0;
      updateTrees(x,z,height,reduced);
      updateGrass(x,z,height,reduced);
    };
  }

  window.MadisonLandscape={create};
})();
