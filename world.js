(() => {
  'use strict';

  const T = THREE;
  const D = MADISON;
  const [west, north, east, south] = D.bounds;
  const [columns, rows, encoded] = D.terrain;
  const terrain = new Int16Array(Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0)).buffer);
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const mix = (a, b, t) => a + (b-a)*t;

  function ground(x, z) {
    const gx = clamp((x-west)/(east-west)*columns, 0, columns-0.0001);
    const gz = clamp((z-north)/(south-north)*rows, 0, rows-0.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const u = gx-i, v = gz-j;
    const k = j*(columns+1)+i, l = k+columns+1;
    const top = terrain[k], right = terrain[k+1], bottom = terrain[l], diagonal = terrain[l+1];
    return (u+v < 1 ? top+(right-top)*u+(bottom-top)*v :
      diagonal+(bottom-diagonal)*(1-u)+(right-diagonal)*(1-v))/16;
  }

  function inRing(x, z, ring) {
    let inside = false;
    for (let i=0, j=ring.length-1; i<ring.length; j=i++) {
      const a=ring[i], b=ring[j];
      if ((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  }

  const inPolygon = (x,z,poly) => inRing(x,z,poly[0]) && !poly.slice(1).some(r=>inRing(x,z,r));
  const area = ring => Math.abs(ring.reduce((sum,[x,z],i)=>{
    const next=ring[(i+1)%ring.length];
    return sum+x*next[1]-z*next[0];
  },0))/2;
  const center = ring => ring.reduce((sum,[x,z])=>[sum[0]+x/ring.length, sum[1]+z/ring.length], [0,0]);

  function bounds(ring) {
    const box = [Infinity,Infinity,-Infinity,-Infinity];
    for (const [x,z] of ring) {
      box[0]=Math.min(box[0],x);
      box[1]=Math.min(box[1],z);
      box[2]=Math.max(box[2],x);
      box[3]=Math.max(box[3],z);
    }
    return box;
  }

  function indexGrid(size) {
    const cells = new Map();
    const at = (x,z) => cells.get(Math.floor(x/size)+','+Math.floor(z/size)) || [];
    function add(box, item, pad=0) {
      for (let i=Math.floor((box[0]-pad)/size);i<=Math.floor((box[2]+pad)/size);i++) {
        for (let j=Math.floor((box[1]-pad)/size);j<=Math.floor((box[3]+pad)/size);j++) {
          const key=i+','+j;
          if (!cells.has(key)) cells.set(key,[]);
          cells.get(key).push(item);
        }
      }
    }
    return {at, add};
  }

  function segmentDistance(x,z,ax,az,bx,bz) {
    const dx=bx-ax, dz=bz-az, length=dx*dx+dz*dz;
    const t=length ? clamp(((x-ax)*dx+(z-az)*dz)/length,0,1) : 0;
    const px=ax+t*dx, pz=az+t*dz;
    return (x-px)**2+(z-pz)**2;
  }

  const buildings = indexGrid(50);
  const roofLevels = new Map();
  for (const [,,,,polygon] of D.houses) buildings.add(bounds(polygon[0]),polygon,3);
  const waterAreas = indexGrid(200);
  for (const polygon of D.water) waterAreas.add(bounds(polygon[0]),polygon);
  const onWater = (x,z) => waterAreas.at(x,z).some(polygon=>inPolygon(x,z,polygon));
  const waters = D.water.map(poly=>{
    if(inPolygon(-1080,-680,poly)) return {poly,name:'Lake Mendota',level:3.35};
    if(inPolygon(660,800,poly)) return {poly,name:'Lake Monona',level:2.33};
    return {poly,name:'',level:2.06};
  });
  const majorLakes=waters.filter(water=>water.name);
  const lakeName=(x,z)=>majorLakes.find(water=>inPolygon(x,z,water.poly))?.name || '';
  function flightFloor(x,z) {
    let floor=Math.max(3.35,ground(x,z))+4.7;
    for(const polygon of buildings.at(x,z)) {
      const roof=roofLevels.get(polygon);
      if(roof && roof+3.5>floor && inPolygon(x,z,polygon)) floor=roof+3.5;
    }
    return floor;
  }
  const roadGrid = indexGrid(62);
  for (const [name,kind,width,bridge,line] of D.roads) {
    for (let i=1; i<line.length; i++) {
      const [[ax,az],[bx,bz]]=[line[i-1],line[i]];
      if (Math.hypot(bx-ax,bz-az)<0.03) continue;
      roadGrid.add(bounds([line[i-1],line[i]]),{name,kind,width,bridge,ax,az,bx,bz},46);
    }
  }

  function nearestRoad(x,z,drivable=false,named=false) {
    let distance = Infinity, road;
    for (const item of roadGrid.at(x,z)) {
      if ((drivable && (item.kind===2 || item.kind===3)) || (named && !item.name)) continue;
      const d = segmentDistance(x,z,item.ax,item.az,item.bx,item.bz);
      if (d<distance) { distance=d; road=item; }
    }
    return road && {...road, distance:Math.sqrt(distance)};
  }

  function streetLayout() {
    const signals=(D.trafficSignals || []).flatMap(([x,z])=>{
      const near=roadGrid.at(x,z).flatMap(road=>{
        if(!road.name || road.kind>1) return [];
        const distance=segmentDistance(x,z,road.ax,road.az,road.bx,road.bz);
        if(distance>289) return [];
        const dx=road.bx-road.ax,dz=road.bz-road.az,norm=Math.hypot(dx,dz);
        return [{...road,dx:dx/norm,dz:dz/norm,distance}];
      });
      if(!near.length) return [];
      near.sort((a,b)=>a.distance-b.distance+(b.width-a.width)*2.3);
      const main=near[0];
      const other=near.find(road=>road.name!==main.name && Math.abs(road.dx*main.dx+road.dz*main.dz)<.67);
      const axis=(road,fallback)=>{
        if(!road) return {dx:-fallback.dz,dz:fallback.dx,extent:5};
        let extent=road.width/2;
        for(const candidate of near) {
          if(candidate.name!==road.name || Math.abs(candidate.dx*road.dx+candidate.dz*road.dz)<.87) continue;
          const lateral=Math.abs((candidate.ax-x)*road.dz-(candidate.az-z)*road.dx);
          extent=Math.max(extent,Math.min(14.4,lateral+candidate.width/2));
        }
        return {dx:road.dx,dz:road.dz,extent};
      };
      const primary=axis(main);
      return [{x,z,axes:[primary,axis(other,primary)]}];
    });
    const stops=(D.brtStations || []).map(([name,x,z])=>{
      let direction=[.719,-.695],best=Infinity;
      for(const line of D.brtCenterlines || []) {
        for(let i=1;i<line.length;i++) {
          const [[ax,az],[bx,bz]]=[line[i-1],line[i]];
          const length=Math.hypot(bx-ax,bz-az);
          if(length<.12) continue;
          const distance=segmentDistance(x,z,ax,az,bx,bz);
          if(distance>=best) continue;
          best=distance;
          const eastward=Math.sign(bx-ax)||1;
          direction=[eastward*(bx-ax)/length,eastward*(bz-az)/length];
        }
      }
      return [name,x,z,...direction];
    });
    return {signals,stops};
  }

  function inBuilding(x,z,radius) {
    for (const polygon of buildings.at(x,z)) {
      if (inPolygon(x,z,polygon)) return true;
      if (radius===0) continue;
      for (const ring of polygon) for (let i=0; i<ring.length; i++) {
        if (segmentDistance(x,z,...ring[i],...ring[(i+1)%ring.length])<radius*radius) return true;
      }
    }
    return false;
  }

  function blocked(x,z,radius) {
    if (x<west+6 || x>east-6 || z<north+6 || z>south-6 || inBuilding(x,z,radius)) return true;
    if (!onWater(x,z)) return false;
    const road=nearestRoad(x,z);
    return !road || road.distance>road.width/2+1;
  }

  function random(seed) {
    let value=(seed|0) || 1;
    return () => {
      value^=value<<13; value^=value>>>17; value^=value<<5;
      return (value>>>0)/4294967296;
    };
  }

  function batch() {
    const points=[], colors=[], uv=[];
    function triangle(a,b,c,color,tex=[[0,0],[0,0],[0,0]]) {
      points.push(...a,...b,...c);
      for (const xy of tex) {
        colors.push(color.r,color.g,color.b);
        uv.push(...xy);
      }
    }
    function quad(a,b,c,d,color,width=1,height=1,v=0,u=0) {
      triangle(a,b,c,color,[[u,v],[u+width,v],[u+width,v+height]]);
      triangle(a,c,d,color,[[u,v],[u+width,v+height],[u,v+height]]);
    }
    function mesh(material) {
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      geometry.computeVertexNormals();
      return new T.Mesh(geometry,material);
    }
    return {triangle,quad,mesh};
  }

  function chunkedBatch(size=340) {
    const chunks=new Map();
    function at(a,b,c) {
      const x=Math.floor((a[0]+b[0]+c[0])/(3*size)), z=Math.floor((a[2]+b[2]+c[2])/(3*size));
      const key=x+','+z;
      if(!chunks.has(key)) chunks.set(key,batch());
      return chunks.get(key);
    }
    return {
      triangle(a,b,c,...args) { at(a,b,c).triangle(a,b,c,...args); },
      quad(a,b,c,d,...args) { at(a,b,c).quad(a,b,c,d,...args); },
      mesh(material,cast=false,range=1780) {
        const group=new T.Group();
        for(const chunk of chunks.values()) {
          const mesh=chunk.mesh(material);
          mesh.geometry.computeBoundingSphere();
          mesh.castShadow=cast;
          mesh.receiveShadow=true;
          mesh.userData.range=range;
          group.add(mesh);
        }
        return group;
      }
    };
  }

  function triangulate(polygon) {
    const [outer,...holes] = polygon.map(ring=>ring.map(([x,z])=>new T.Vector2(x,z)));
    const faces=T.ShapeUtils.triangulateShape(outer,holes);
    return [outer.concat(...holes),faces];
  }

  function fill(sink,polygon,surface,color) {
    const [points,faces]=triangulate(polygon);
    for (const face of faces) {
      const [a,b,c]=face.map(i=>[points[i].x,surface(points[i].x,points[i].y),points[i].y]);
      sink.triangle(a,c,b,color);
    }
  }

  function box(parent,w,h,d,x,y,z,material) {
    const mesh = new T.Mesh(new T.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);
    parent.add(mesh);
    return mesh;
  }

  function cylinder(parent,a,b,height,x,y,z,material,sides=32) {
    const mesh=new T.Mesh(new T.CylinderGeometry(a,b,height,sides),material);
    mesh.position.set(x,y,z);
    parent.add(mesh);
    return mesh;
  }

  function mergeLandmark(group) {
    group.updateMatrixWorld(true);
    const inverse=group.matrixWorld.clone().invert(), transform=new T.Matrix4();
    const materials=new Map();
    group.traverse(mesh=>{
      if(!mesh.isMesh) return;
      const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
      geometry.applyMatrix4(transform.multiplyMatrices(inverse,mesh.matrixWorld));
      if(!materials.has(mesh.material)) materials.set(mesh.material,[]);
      materials.get(mesh.material).push(geometry);
    });
    group.clear();
    for(const [material,parts] of materials) {
      const geometry=new T.BufferGeometry();
      const attributes=material.vertexColors?['position','normal','color']:['position','normal'];
      for(const name of attributes) {
        const count=parts.reduce((sum,part)=>sum+part.getAttribute(name).array.length,0);
        const values=new Float32Array(count);
        let offset=0;
        for(const part of parts) {
          const source=part.getAttribute(name).array;
          values.set(source,offset);
          offset+=source.length;
        }
        geometry.setAttribute(name,new T.BufferAttribute(values,3));
      }
      const mesh=new T.Mesh(geometry,material);
      mesh.castShadow=mesh.receiveShadow=true;
      group.add(mesh);
    }
  }

  function surfaceMaterial(options={}) {
    return new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,...options});
  }

  async function aerialTextures() {
    const fallback=new T.DataTexture(new Uint8Array([165,171,146,255]),1,1,T.RGBAFormat);
    fallback.needsUpdate=true;
    const load=async name=>{
      const src=document.querySelector('meta[name="madison-'+name+'"]')?.content;
      if(!src || location.protocol==='file:' && !src.startsWith('data:')) return fallback;
      try {
        const texture=await new T.TextureLoader().loadAsync(src);
        texture.colorSpace=T.SRGBColorSpace;
        texture.anisotropy=6;
        return texture;
      } catch(error) {
        console.warn('Aerial imagery unavailable for '+name,error);
        return fallback;
      }
    };
    const [detail,region]=await Promise.all([load('aerial'),load('region')]);
    const mask=document.createElement('canvas');
    mask.width=1536;
    mask.height=972;
    const shape=mask.getContext('2d');
    shape.fillStyle='#fff';
    for(const {poly} of waters) {
      shape.beginPath();
      for(const ring of poly) {
        ring.forEach(([x,z],index)=>shape[index?'lineTo':'moveTo'](
          (x-west)/(east-west)*mask.width,(z-north)/(south-north)*mask.height));
        shape.closePath();
      }
      shape.fill('evenodd');
    }
    const waterMask=new T.CanvasTexture(mask);
    return {detail,region,waterMask,available:detail!==fallback,regional:region!==fallback};
  }

  function surveyMaterial(photos,terrainMaterial) {
    const material=surfaceMaterial();
    material.customProgramCacheKey=()=>terrainMaterial?'survey terrain':'survey rooftops';
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{
        aerial:{value:photos.detail}, region:{value:photos.region},
        waterMask:{value:photos.waterMask},
        imagery:{value:photos.available?1:0}, regional:{value:photos.regional?1:0},
        aerialBounds:{value:new T.Vector4(west,north,east,south)}
      });
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 field;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nfield=position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`
        #include <common>
        varying vec3 field;
        uniform sampler2D aerial,region,waterMask;
        uniform float imagery,regional;
        uniform vec4 aerialBounds;
      `).replace('#include <color_fragment>',`
        #include <color_fragment>
        vec2 tex=(field.xz-aerialBounds.xy)/(aerialBounds.zw-aerialBounds.xy);
        vec2 broad=field.xz/vec2(12600.,9400.)+.5;
        vec2 edge=min(tex,1.-tex);
        vec2 broadEdge=min(broad,1.-broad);
        float blend=smoothstep(-.003,.017,min(edge.x,edge.y))*imagery;
        float extended=smoothstep(0.,.09,min(broadEdge.x,broadEdge.y))*regional;
        vec3 detailColor=texture2D(aerial,vec2(tex.x,1.-tex.y)).rgb;
        vec3 broadColor=texture2D(region,vec2(broad.x,1.-broad.y)).rgb;
        float altitude=smoothstep(12.,138.,cameraPosition.y-field.y);
        float grit=fract(sin(dot(floor(field.xz*17.),vec2(15.61,113.23)))*35727.32);
      `+(terrainMaterial?`
        if(field.y<9.5 && min(edge.x,edge.y)>0. && texture2D(waterMask,vec2(tex.x,1.-tex.y)).a>.63) discard;
        vec3 terrainTint=mix(diffuseColor.rgb,broadColor*1.18,extended*.82);
        float brightness=dot(detailColor,vec3(.27,.64,.09));
        vec3 corrected=mix(vec3(brightness),detailColor,1.12)*1.14;
        diffuseColor.rgb=mix(terrainTint,corrected,blend*(.59+altitude*.34));
        float green=smoothstep(.012,.057,corrected.g-max(corrected.r*.946,corrected.b));
        float near=1.-smoothstep(7.,82.,distance(cameraPosition,field));
        float clumps=.5+.26*sin(dot(field.xz,vec2(3.8,-3.1)))+.24*sin(dot(field.xz,vec2(7.,4.7)));
        float blades=fract(sin(dot(floor(field.xz*48.),vec2(63.2,41.3)))*19738.12);
        float lawnVariation=.78+clumps*.20+blades*.29;
        vec3 lawn=mix(diffuseColor.rgb*vec3(1.27,1.11,.76),vec3(.168,.219,.077),.36);
        diffuseColor.rgb=mix(diffuseColor.rgb,lawn*lawnVariation,green*near*.90);
        diffuseColor.rgb*=.955+grit*.084;
      `:`
        float brightness=dot(detailColor,vec3(.22,.70,.08));
        vec3 roofTexture=mix(vec3(brightness),detailColor,.49);
        diffuseColor.rgb=mix(diffuseColor.rgb,roofTexture,blend*(.14+altitude*.34));
        diffuseColor.rgb*=.945+grit*.083;
      `));
    };
    return material;
  }

  function worldSurface(scene,photos) {
    const axis=(start,end,cells,limit)=>[-limit,-limit*.67,start-610,start-300,start-110,start-37,
      ...Array.from({length:cells+1},(_,i)=>mix(start,end,i/cells)),end+37,end+110,end+300,end+610,limit*.67,limit];
    const xs=axis(west,east,columns,6300), zs=axis(north,south,rows,4700);
    const land=new T.PlaneGeometry(12600,9400,xs.length-1,zs.length-1);
    land.rotateX(-Math.PI/2);
    const points=land.getAttribute('position');
    const colors=[];
    const color=new T.Color(), city=new T.Color(0xa9a294);
    for (let i=0;i<points.count;i++) {
      const x=xs[i%xs.length],z=zs[Math.floor(i/xs.length)];
      const outside=Math.max(west-x,x-east,north-z,z-south,0);
      const y=outside?mix(ground(x,z),-2.35,1-Math.exp(-outside/167)):ground(x,z);
      points.setXYZ(i,x,y,z);
      const dense=clamp(1-Math.min(Math.abs(z),Math.hypot(x,z)*.35)/590,0,1)*.55;
      color.set(0x728a5a).lerp(city,dense);
      color.multiplyScalar(.96+.062*Math.sin(x*.021+z*.012)+.028*Math.sin(z*.049));
      if (Math.abs(x)<100 && Math.abs(z)<94) color.set(0x627f42).multiplyScalar(.98+.09*Math.sin(x*.055+z*.038));
      colors.push(color.r,color.g,color.b);
    }
    land.computeVertexNormals();
    land.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const landMesh=new T.Mesh(land,surveyMaterial(photos,true));
    landMesh.receiveShadow=true;
    scene.add(landMesh);
    const surround = new T.Mesh(new T.PlaneGeometry(52000,52000),new T.MeshLambertMaterial({color:0x72845f}));
    surround.rotation.x=-Math.PI/2;
    surround.position.y=-3;
    scene.add(surround);

    if(photos.available) return;
    const turf=batch();
    for (const [name,poly] of D.parks) {
      if (name === 'State Street/Mall Concourse') continue;
      fill(turf,poly,(x,z)=>ground(x,z)+0.05,new T.Color(0x79965b));
    }
    const parkMesh=turf.mesh(surfaceMaterial({polygonOffset:true,polygonOffsetFactor:-1}));
    scene.add(parkMesh);
  }

  function pavingTexture(sidewalk) {
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=256;
    const context=canvas.getContext('2d');
    const rng=random(sidewalk?26832:691003);
    context.fillStyle=sidewalk?'#a7a7a7':'#939393';
    context.fillRect(0,0,256,256);
    for(let i=0;i<90;i++) {
      const x=rng()*256,z=rng()*256,r=5+rng()*36;
      const value=rng()<.5?'255,255,255':'24,24,24';
      const stain=context.createRadialGradient(x,z,1,x,z,r);
      stain.addColorStop(0,'rgba('+value+',.105)');
      stain.addColorStop(1,'rgba('+value+',0)');
      context.fillStyle=stain;
      context.fillRect(x-r,z-r,r*2,r*2);
    }
    for(let i=0;i<5100;i++) {
      const value=Math.round(44+rng()*192);
      context.fillStyle='rgba('+value+','+value+','+value+','+(.16+rng()*.46)+')';
      context.fillRect(rng()*256,rng()*256,1+rng()*2.2,1+rng()*1.6);
    }
    if(!sidewalk) {
      for(let line=0;line<11;line++) {
        let x=rng()*249,z=rng()*245;
        context.beginPath();
        context.moveTo(x,z);
        for(let j=0;j<5;j++) {
          x+=2+rng()*6;
          z+=rng()*13-6.5;
          context.lineTo(x,z);
        }
        context.strokeStyle='#24252561';
        context.lineWidth=.7+rng()*.8;
        context.stroke();
      }
    }
    const texture=new T.CanvasTexture(canvas);
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.anisotropy=5;
    return texture;
  }

  function pavingMaterial(sidewalk,plaza=false) {
    const material=surfaceMaterial();
    const surface=pavingTexture(sidewalk);
    material.customProgramCacheKey=()=>plaza?'plaza stone':sidewalk?'sidewalk pavement':'road pavement';
    material.onBeforeCompile=shader=>{
      shader.uniforms.pavement={value:surface};
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`
        #include <common>
        varying vec3 pavingPosition;
        varying vec2 pavingUV;
      `).replace('#include <begin_vertex>','#include <begin_vertex>\npavingPosition=position;\npavingUV=uv;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`
        #include <common>
        varying vec3 pavingPosition;
        varying vec2 pavingUV;
        uniform sampler2D pavement;
      `).replace('#include <color_fragment>',`
        #include <color_fragment>
        vec2 point=pavingPosition.xz;
        float detail=texture2D(pavement,point*.42).r;
        float aggregate=texture2D(pavement,point*2.6).r;
        float macro=texture2D(pavement,point*.077+vec2(.33,.79)).r;
        float worn=1.-smoothstep(17.,78.,distance(cameraPosition,pavingPosition));
        diffuseColor.rgb*=.78+macro*.31+(detail-.48)*.48+(aggregate-.50)*.29*worn;
      `+(sidewalk?`
        vec2 pavingSlabs=`+(plaza?'pavingPosition.xz':'pavingUV')+`;
        float section=mod(pavingSlabs.x/1.65+.01,1.);
        float jointDistance=min(section,1.-section);
        float joint=1.-smoothstep(.007,.028,jointDistance);
        float across=mod(pavingSlabs.y/.9+.02,1.);
        float edgeJoint=1.-smoothstep(.006,.026,min(across,1.-across));
        diffuseColor.rgb*=1.-(joint*.27+edgeJoint*.19)*worn;
      `:`
        float wheel=abs(fract(pavingUV.y/3.31+.23)*2.-1.);
        float laneWear=(1.-smoothstep(.10,.31,wheel))*.043;
        diffuseColor.rgb+=diffuseColor.rgb*laneWear*macro;
      `));
    };
    return material;
  }

  function asphalt(scene,signals) {
    const sidewalk=chunkedBatch(), surfaces=chunkedBatch(), paint=chunkedBatch(), rapid=chunkedBatch(), junctions=new Map();
    const walk=new T.Color(0xb8b2a8), white=new T.Color(0xf7e9d5), yellow=new T.Color(0xe9ad46);
    const styles=[0x4c5055,0x55575b,0x9a8f7f,0x9a9080,0x777573].map(c=>new T.Color(c));
    const concrete=new T.Color(0x777472), transitRed=new T.Color(0xa54237);
    const intersectionGrid=indexGrid(65);
    const stencils=[];
    for(const [x,z] of D.trafficSignals || []) intersectionGrid.add([x,z,x,z],[x,z],21);

    function roadBand(target,ax,az,bx,bz,half,lift,color,ends=false) {
      const dx=bx-ax, dz=bz-az, length=Math.hypot(dx,dz);
      const sx=-dz/length*half, sz=dx/length*half, phase=(ax*dx+az*dz)/length;
      const steps=Math.max(1,Math.ceil(length/7));
      const vertex=(x,z)=>[x,ground(x,z)+lift,z];
      for (let step=0;step<steps;step++) {
        const a=step/steps, b=(step+1)/steps;
        const x=ax+dx*a,z=az+dz*a,ex=ax+dx*b,ez=az+dz*b;
        target.quad(vertex(x+sx,z+sz),vertex(ex+sx,ez+sz),vertex(ex-sx,ez-sz),vertex(x-sx,z-sz),
          color,length/steps,2*half,0,phase+a*length);
      }
      if (!ends) return;
      for (const [x,z] of [[ax,az],[bx,bz]]) {
        for (let j=0;j<6;j++) {
          const a=j*Math.PI/3,b=(j+1)*Math.PI/3;
          target.triangle(vertex(x,z),vertex(x+Math.cos(b)*half,z+Math.sin(b)*half),
            vertex(x+Math.cos(a)*half,z+Math.sin(a)*half),color);
        }
      }
    }

    for (const [name,kind,width,,line,busLane,driveway] of D.roads) {
      const eastWash=name==='East Washington Avenue';
      const painted=eastWash || kind===0 || kind===1 && /Carroll|Mifflin|Pinckney|Main Street|Hamilton|Wilson/.test(name);
      if(name && kind<=2) for(const index of [0,line.length-1]) {
        const [x,z]=line[index];
        if(Math.hypot(x*.76,z)>910) continue;
        const [nx,nz]=line[index===0?1:index-1];
        const key=Math.round(x/3)+','+Math.round(z/3);
        if(!junctions.has(key)) junctions.set(key,[]);
        junctions.get(key).push({name,kind,width,x,z,nx,nz});
      }
      for (let i=1;i<line.length;i++) {
        const [[ax,az],[bx,bz]]=[line[i-1],line[i]];
        const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz);
        if (length<.04) continue;
        if (kind<=2) roadBand(sidewalk,ax,az,bx,bz,width/2+(kind===2?1.5:2.05),.105,walk,true);
        roadBand(surfaces,ax,az,bx,bz,width/2,driveway?.076:.241-kind*.017,
          driveway?concrete:eastWash&&width>9?concrete:styles[kind],length>1.0 && !driveway);
        if(busLane) {
          const lateral=width/2-1.81, ux=dx/length,uz=dz/length;
          const bx0=ax+uz*lateral,bz0=az-ux*lateral;
          const phase=bx0*ux+bz0*uz;
          const step=length/Math.max(1,Math.ceil(length/5));
          for(let at=0;at<length-.04;at+=step) {
            const x=bx0+(at+step/2)*ux,z=bz0+(at+step/2)*uz;
            if(intersectionGrid.at(x,z).some(([px,pz])=>Math.hypot(px-x,pz-z)<15)) continue;
            roadBand(rapid,bx0+at*ux,bz0+at*uz,bx0+(at+step)*ux,bz0+(at+step)*uz,1.66,.275,transitRed);
            if(Math.floor((phase+at)/132)!==Math.floor((phase+at+step)/132) &&
              !intersectionGrid.at(x,z).some(([px,pz])=>Math.hypot(px-x,pz-z)<21)) {
              stencils.push([x,z,ux,uz]);
            }
          }
        }
        if (!painted || length<7) continue;
        const start=i===1?5:1;
        const end=length-(i===line.length-1?5:1);
        const marks=(offset,color,size,spacing) => {
          const ox=-dz/length*offset,oz=dx/length*offset;
          for (let m=start;m<end-size;m+=spacing) {
            roadBand(paint,ax+dx*m/length+ox,az+dz*m/length+oz,
              ax+dx*(m+size)/length+ox,az+dz*(m+size)/length+oz,size>5?.085:.065,.285,color);
          }
        };
        if(eastWash && width>=9) {
          const laneCount=Math.round((width-1.0)/3.31);
          for(let lane=1;lane<laneCount;lane++) marks((lane-laneCount/2)*3.31,white,4.2,10.5);
        } else {
          marks(0,kind===0?yellow:white,kind===0?5:2.6,kind===0?8.4:8.7);
        }
        if (!eastWash && width>=13) {
          marks(width*.23,white,3.2,10);
          marks(-width*.23,white,3.2,10);
        }
      }
    }
    for(const arms of junctions.values()) {
      if(new Set(arms.map(arm=>arm.name)).size<2) continue;
      for(const {kind,width,x,z,nx,nz} of arms) {
        if(intersectionGrid.at(x,z).some(([sx,sz])=>Math.hypot(x-sx,z-sz)<18)) continue;
        const length=Math.hypot(nx-x,nz-z);
        if(kind===2||length<7) continue;
        const dx=(nx-x)/length,dz=(nz-z)/length;
        const cx=x+dx*6.1,cz=z+dz*6.1;
        for(let across=-width*.4;across<=width*.4;across+=.78) {
          const px=cx-dz*across,pz=cz+dx*across;
          roadBand(paint,px,pz,px+dx*1.9,pz+dz*1.9,.19,.305,white);
        }
      }
    }
    for(const {x,z,axes} of signals) {
      for(let direction=0;direction<2;direction++) {
        const {dx,dz,extent}=axes[direction];
        for(const sign of [-1,1]) {
          const off=sign*(axes[1-direction].extent+.58), rx=-dz,rz=dx;
          const cx=x+dx*off,cz=z+dz*off;
          for(let step=-extent+.65;step<extent-.48;step+=.84) {
            const sx=cx+rx*step,sz=cz+rz*step;
            roadBand(paint,sx,sz,sx+dx*sign*1.74,sz+dz*sign*1.74,.185,.315,white);
          }
          const stopX=cx+dx*sign*2.85,stopZ=cz+dz*sign*2.85;
          roadBand(paint,stopX,stopZ,stopX-rx*sign*(extent-.45),stopZ-rz*sign*(extent-.45),.15,.315,white);
        }
      }
    }
    const roadMaterial=pavingMaterial(false);
    scene.add(sidewalk.mesh(pavingMaterial(true)),surfaces.mesh(roadMaterial),rapid.mesh(roadMaterial),paint.mesh(surfaceMaterial()));
    return stencils;
  }

  function streetLights(scene) {
    const locations=new Map();
    for(const [name,kind,width,,line] of D.roads) {
      if(!name || kind>2) continue;
      let carry=19;
      for(let i=1;i<line.length;i++) {
        const [[x,z],[nx,nz]]=[line[i-1],line[i]];
        const length=Math.hypot(nx-x,nz-z);
        while(carry<length-5) {
          const dx=(nx-x)/length,dz=(nz-z)/length, off=width/2+1.15;
          for(const side of [-1,1]) {
            const px=x+dx*carry-dz*off*side,pz=z+dz*carry+dx*off*side;
            if(Math.hypot(px*.75,pz)>1000 || inBuilding(px,pz,.38) || onWater(px,pz)) continue;
            const key=Math.floor(px/6)+','+Math.floor(pz/6);
            if(!locations.has(key)) locations.set(key,[px,pz,kind===2?3.8:5.3]);
          }
          carry+=34;
        }
        carry=Math.max(5,carry-length);
      }
    }
    const post=new T.MeshLambertMaterial({color:0x3d4841});
    const cap=new T.MeshLambertMaterial({color:0xe1d6ac,emissive:0xffa13b,emissiveIntensity:.10});
    const poles=new T.InstancedMesh(new T.CylinderGeometry(.072,.11,1,7),post,locations.size);
    const lamps=new T.InstancedMesh(new T.SphereGeometry(.25,8,6),cap,locations.size);
    const dummy=new T.Object3D();
    let index=0;
    for(const [x,z,h] of locations.values()) {
      const y=ground(x,z);
      dummy.position.set(x,y+h/2,z);
      dummy.scale.set(1,h,1);
      dummy.updateMatrix();
      poles.setMatrixAt(index,dummy.matrix);
      dummy.position.set(x,y+h,z);
      dummy.scale.set(1,1.35,1);
      dummy.updateMatrix();
      lamps.setMatrixAt(index++,dummy.matrix);
    }
    scene.add(poles,lamps);
    return evening=>{ cap.emissiveIntensity=.10+evening*1.75; };
  }

  function facadeMaterial(evening) {
    const tile=document.createElement('canvas');
    tile.width=1024;
    tile.height=128;
    const ctx=tile.getContext('2d');
    const rng=random(8321);
    const widths=[67,59,97,49,108];
    const vertical=[[26,82],[22,85],[5,105],[18,86],[18,110]];
    const stone=['#f2ded0','#eee8d9','#c7ccc8','#ece6dc','#d3c8b9'];
    for(let style=0;style<widths.length;style++) {
      ctx.save();
      ctx.translate(128*style,0);
      ctx.fillStyle=stone[style];
      ctx.fillRect(0,0,128,128);

      if(style===0 || style===1 || style===3) {
        const course=style===0?9:style===1?17:5;
        const courseWidth=style===0?28:style===1?51:128;
        for(let row=0;row*course<128;row++) {
          const y=row*course;
          for(let x=-courseWidth+(row%2)*courseWidth/2;x<128;x+=courseWidth) {
            const alpha=rng()*.14;
            ctx.fillStyle='rgba(47,30,26,'+alpha+')';
            ctx.fillRect(x,y,courseWidth-1,course-1);
            ctx.fillStyle='#ffffff55';
            ctx.fillRect(x,y,courseWidth-1,1);
          }
        }
      }
      for(let i=0;i<180;i++) {
        ctx.fillStyle=rng()<.5?'#64544619':'#fff3dc26';
        ctx.fillRect(rng()*128,rng()*128,1+rng()*7,1+rng()*2);
      }
      const width=widths[style],l=(128-width)/2,[top,bottom]=vertical[style];
      ctx.fillStyle='#413a3677';
      ctx.fillRect(l-3,top-2,width+8,bottom-top+12);
      ctx.fillStyle=style===2?'#839499':'#d5ccbb';
      ctx.fillRect(l-3,top-4,width+6,bottom-top+8);
      ctx.fillStyle='#443e37';
      ctx.fillRect(l,top,width,bottom-top);
      const glass=ctx.createLinearGradient(l,top,l+width*.35,bottom);
      glass.addColorStop(0,style===2?'#83aac0':'#7091a0');
      glass.addColorStop(.29,style===2?'#56798c':'#4c6b7b');
      glass.addColorStop(.59,'#38536a');
      glass.addColorStop(1,'#243e51');
      ctx.fillStyle=glass;
      ctx.fillRect(l+2,top+2,width-4,bottom-top-4);
      ctx.fillStyle='#dceafa31';
      ctx.beginPath();
      ctx.moveTo(l+3,top+3);
      ctx.lineTo(l+width*.7,top+3);
      ctx.lineTo(l+3,top+(bottom-top)*.84);
      ctx.fill();
      ctx.fillStyle=style===4?'#50554f':style===2?'#7c8c8d':'#ded8c8';
      const segments=style===4?3:style===2?2:1;
      for(let i=1;i<=segments;i++) {
        ctx.fillRect(l+width*i/(segments+1)-1,top+1,3,bottom-top-2);
      }
      ctx.fillRect(l+1,top+(bottom-top)*(style===4?.27:.57),width-2,style===2?1.7:3);
      ctx.fillStyle=style===2?'#9eaaa7':'#ece2d1';
      ctx.fillRect(l-6,bottom+1,width+12,4);
      ctx.fillStyle='#55534566';
      ctx.fillRect(0,119,128,6);
      ctx.fillStyle='#fff2de77';
      ctx.fillRect(0,116,128,3);
      if(style===4) {
        ctx.fillStyle='#5d5148';
        ctx.fillRect(0,5,128,10);
        ctx.fillStyle='#e0c897';
        ctx.fillRect(12,8,99,2);
      }
      ctx.restore();
    }
    const map=new T.CanvasTexture(tile);
    map.colorSpace=T.SRGBColorSpace;
    map.flipY=false;
    map.anisotropy=5;
    const material=surfaceMaterial({map});
    material.onBeforeCompile=shader=>{
      shader.uniforms.evening=evening;
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float evening;')
        .replace('#include <map_fragment>',`
          vec2 repeatUV=vMapUv;
          float profile=floor((repeatUV.y+.00002)/128.);
          vec2 cell=fract(repeatUV);
          vec2 atlasUV=vec2((profile*128.+1.+cell.x*126.)/1024.,(1.+(1.-cell.y)*126.)/128.);
          #if __VERSION__ >= 300
            vec4 panel=textureGrad(map,atlasUV,dFdx(repeatUV)*vec2(.123,-.984),dFdy(repeatUV)*vec2(.123,-.984));
          #else
            vec4 panel=texture2D(map,atlasUV);
          #endif
          float glazing=smoothstep(.018,.115,panel.b-panel.r);
          vec3 tint=mix(diffuseColor.rgb,vec3(.72,.83,.93),glazing*.62);
          diffuseColor.rgb=tint*panel.rgb;
          vec2 windowId=floor(repeatUV)+floor(vMapUv.yx*.37);
          float occupancy=fract(sin(dot(windowId,vec2(78.23,13.71)))*43758.5453);
        `).replace('#include <emissivemap_fragment>',`
          #include <emissivemap_fragment>
          totalEmissiveRadiance+=vec3(.79,.34,.105)*glazing*evening*smoothstep(.70,.89,occupancy);
        `);
    };
    return material;
  }

  const knownHeights={
    'Overture Center':23, 'Memorial Union':23, 'State Historical Society':26,
    'Chazen Museum of Art':20, 'Madison Central Library':18, 'Kohl Center':27,
    'Madison Municipal Building':20, 'City-County Building':36
  };

  function cityBlocks(scene,photos,evening,homes,stadium) {
    const walls=chunkedBatch(), roofs=chunkedBatch(), foundations=chunkedBatch(), trims=chunkedBatch();
    const stone=[0xbe8164,0xc3afa2,0xe1c9aa,0xa26c53,0xcecbc3,0x8ba6ae,0xadb6a5,0x987464];
    const home=[0xc5ab89,0xaab199,0xb88767,0xdfd4bb,0xa2b3a9,0xd1c5a7,0xbfa997];
    for (const [id,name,kind,measured,poly] of D.houses) {
      if (name==='Wisconsin State Capitol' || name==='Monona Terrace' || (stadium && name==='Breese Stevens Field')) continue;
      const ring=poly[0], [x,z]=center(ring), size=area(ring);
      if (size<4 || x<west-55 || x>east+55 || z<north-55 || z>south+55) continue;
      const rng=random(id*11939);
      const downtown=clamp(1-Math.hypot(x*.76,z*1.85)/800,0,1);
      const estimated=kind===2 ? 3.3+rng()*1.6 : kind===1 ?
        6.2+rng()*4.6+clamp((size-300)/35,0,17)*Math.max(.42,downtown) :
        8+rng()*5+Math.min(Math.sqrt(size)*.36,19)*(downtown*.7+.33)+downtown*rng()*14;
      if(kind===1 && !knownHeights[name] && homes.build(id,poly,measured,estimated)) continue;
      const height=knownHeights[name] || measured || estimated;
      const base=ground(x,z), top=base+height;
      const palette=kind===0?stone:home;
      const wall=new T.Color(palette[Math.floor(rng()*palette.length)]);
      const roof=wall.clone().lerp(new T.Color(kind===0?0x63696b:0x645953),.68);
      const brick=wall.clone().multiplyScalar(.73);
      const style=kind===1?3:height>24&&rng()>.46?2:rng()>.50?1:0;
      const simpleHome=kind===1 && size<250 && ring.length<=10 && poly.length===1 && rng()<.67;
      const retail=kind===0 && (downtown>.32 || name==='Overture Center') && size>210;
      const equipment=kind===0 && size>420 && size<5800 && rng()<.72 && inPolygon(x,z,poly);
      const roofLift=simpleHome?Math.min(2.6,Math.sqrt(size)*.19):equipment?1.65:.44;
      roofLevels.set(poly,top+roofLift);

      for (const outline of poly) {
        for (let i=0;i<outline.length;i++) {
          const [ax,az]=outline[i], [bx,bz]=outline[(i+1)%outline.length];
          const length=Math.hypot(ax-bx,az-bz);
          if (length<.2) continue;
          const direction=.84+.16*Math.abs((bx-ax)/length);
          const face=wall.clone().multiplyScalar(direction);
          const low=Math.min(base-2,ground(ax,az)-1,ground(bx,bz)-1);
          const floor=base+.7;
          foundations.quad([ax,low,az],[bx,low,bz],[bx,floor,bz],[ax,floor,az],brick);
          const target=kind===2 || length<1.7 ? foundations : walls;
          const groundStory=retail && length>4.75 && height>7;
          const storiesStart=groundStory?floor+3.6:floor;
          const bays=Math.max(1,Math.round(length/(style===2?2.4:kind===1?3.1:3.65)));
          if(groundStory) target.quad([ax,floor,az],[bx,floor,bz],[bx,storiesStart,bz],[ax,storiesStart,az],face,
            bays,1,4*128);
          target.quad([ax,storiesStart,az],[bx,storiesStart,bz],[bx,top,bz],[ax,top,az],face,
            bays,Math.max(1,Math.round((top-storiesStart)/(style===2?3.4:3.15))),style*128);
          if (kind===0 && height>8) trims.quad([ax,top-.25,az],[bx,top-.25,bz],[bx,top+.4,bz],[ax,top+.4,az],face.clone().multiplyScalar(1.08));
        }
      }
      if (simpleHome) {
        const [points,faces]=triangulate(poly);
        for (const face of faces) {
          const vertices=face.map(i=>[points[i].x,top,points[i].y]);
          const [a,b,c]=vertices;
          const peak=[(a[0]+b[0]+c[0])/3,top+roofLift,(a[2]+b[2]+c[2])/3];
          roofs.triangle(a,peak,b,roof);
          roofs.triangle(b,peak,c,roof);
          roofs.triangle(c,peak,a,roof);
        }
      } else {
        fill(roofs,poly,()=>top,roof);
      }
      if(equipment) {
        const sizeX=Math.min(3.2,Math.sqrt(size)*.135), sizeZ=sizeX*.58;
        const outline=[[x-sizeX,z-sizeZ],[x+sizeX,z-sizeZ],[x+sizeX,z+sizeZ],[x-sizeX,z+sizeZ]];
        if(outline.every(([px,pz])=>inPolygon(px,pz,poly))) {
          const tint=new T.Color(0xa8ada4);
          fill(trims,[outline],()=>top+roofLift,tint);
          outline.forEach(([ax,az],i)=>{
            const [bx,bz]=outline[(i+1)%4];
            trims.quad([ax,top,az],[bx,top,bz],[bx,top+roofLift,bz],[ax,top+roofLift,az],tint);
          });
        }
      }
    }
    scene.add(walls.mesh(facadeMaterial(evening),true));
    const buildingMaterial=surfaceMaterial();
    scene.add(roofs.mesh(surveyMaterial(photos,false),true),foundations.mesh(buildingMaterial),trims.mesh(buildingMaterial));
    homes.complete();
  }

  function capitol(scene) {
    const record=D.houses.find(h=>h[1]==='Wisconsin State Capitol');
    if(!record) return;
    const poly=record[4];
    const [x,z]=center(poly[0]);
    const y=ground(x,z);
    roofLevels.set(poly,y+87);
    const stone=new T.MeshLambertMaterial({color:0xded7c6});
    const highlight=new T.MeshLambertMaterial({color:0xf1e8d2});
    const shade=new T.MeshLambertMaterial({color:0xb9b09e});
    const slate=new T.MeshLambertMaterial({color:0x899091});
    const dark=new T.MeshLambertMaterial({color:0x485751});
    const gold=new T.MeshLambertMaterial({color:0xe3b158});
    const plaza=batch();
    const paving=new T.Color(0xc7bca6);
    for (const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
      const p=(a,b)=>[x+a*Math.cos(angle)-b*Math.sin(angle),z+a*Math.sin(angle)+b*Math.cos(angle)];
      const approach=[p(21,-17),p(105,-14),p(105,14),p(21,17)];
      for (let distance=24;distance<105;distance+=3) {
        for(let cross=-11;cross<11;cross+=2.75) {
          const quad=[p(distance,cross),p(distance+3,cross),p(distance+3,cross+2.75),p(distance,cross+2.75)];
          fill(plaza,[quad],(px,pz)=>ground(px,pz)+.26,paving);
        }
      }
      for (const corner of approach.slice(1,3)) {
        const [px,pz]=corner;
        cylinder(scene,1.7,1.9,.65,px,ground(px,pz)+.33,pz,shade,12);
      }
    }
    const plazaMesh=plaza.mesh(pavingMaterial(true,true));
    plazaMesh.receiveShadow=true;
    scene.add(plazaMesh);
    const building=new T.Group();
    building.position.set(x,y,z);
    building.rotation.y=.018;
    scene.add(building);
    box(building,53,23,51,0,11,0,stone);
    box(building,56,2.4,55,0,22.8,0,highlight);
    for (let side=0;side<4;side++) {
      const wing=new T.Group();
      wing.rotation.y=side*Math.PI/2;
      building.add(wing);
      box(wing,35,2.5,49,0,.1,40,shade);
      box(wing,33,18,44,0,10,38,stone);
      box(wing,35,1.65,46,0,19.8,38,highlight);
      box(wing,32,2.1,43,0,21.05,38,slate);
      box(wing,25,2,13,0,18,58,highlight);
      for (let step=0;step<7;step++) {
        box(wing,27,.30,6.2-step*.63,0,step*.28-1,62-step*.35,highlight);
      }
      for (let col=-3;col<=3;col++) {
        const px=col*3.64;
        cylinder(wing,.59,.77,13.8,px,9,60,highlight,12);
        cylinder(wing,.85,.85,.65,px,2.2,60,shade,12);
        cylinder(wing,.92,.62,.68,px,16,60,stone,12);
      }
      const pediment=batch();
      const cream=new T.Color(0xf4e4ca);
      pediment.triangle([-13,19,62],[13,19,62],[0,25.3,62],cream);
      pediment.triangle([-13,19,59],[0,25.3,59],[13,19,59],cream);
      pediment.quad([-13,19,62],[0,25.3,62],[0,25.3,59],[-13,19,59],cream);
      pediment.quad([0,25.3,62],[13,19,62],[13,19,59],[0,25.3,59],cream);
      wing.add(pediment.mesh(surfaceMaterial()));
      for (let i=-2;i<=2;i++) box(wing,1.9,5,.35,i*4.25,8.5,60.03,dark);
      for (const px of [-16.62,16.62]) for (let j=0;j<6;j++) {
        for (const h of [6,13]) box(wing,.2,2.5,1.8,px,h,23+j*6.2,dark);
      }
    }
    cylinder(building,25,26,3,0,24,0,shade,48);
    cylinder(building,23,24,3,0,27,0,highlight,48);
    cylinder(building,20,22,15.2,0,36,0,stone,48);
    for (let i=0;i<36;i++) {
      const a=i*Math.PI/18, cx=Math.cos(a), cz=Math.sin(a);
      cylinder(building,.44,.68,13.1,cx*21.8,36,cz*21.8,highlight,10);
      const window=box(building,1.5,6.5,.38,cx*21,36,cz*21,dark);
      window.rotation.y=Math.PI/2-a;
    }
    for (const [radius,h,level] of [[23.1,1.5,43.4],[22,2,45.2],[21,2,47.5],[20.3,1,49]]) {
      cylinder(building,radius,radius,h,0,level,0,highlight,48);
    }
    const profile=[[20.2,48.5],[20,51],[19.1,55],[17.6,59],[15.5,63],[12.7,66.8],[9.6,70],[6.5,72.7],[4.2,74.4]]
      .map(([radius,height])=>new T.Vector2(radius,height));
    building.add(new T.Mesh(new T.LatheGeometry(profile,64),stone));
    for(let i=0;i<24;i++) {
      const a=i*Math.PI/12;
      const rib=new T.CatmullRomCurve3(profile.map(p=>new T.Vector3((p.x+.05)*Math.cos(a),p.y,(p.x+.05)*Math.sin(a))));
      building.add(new T.Mesh(new T.TubeGeometry(rib,10,.12,3,false),highlight));
    }
    cylinder(building,4.2,4.8,1.1,0,74.5,0,shade);
    cylinder(building,3.05,3.7,5.2,0,77.3,0,highlight);
    cylinder(building,1.6,3.8,2.1,0,80.7,0,stone);
    cylinder(building,.7,1.2,1.4,0,82.2,0,gold,10);
    cylinder(building,.64,.5,2.5,0,84,0,gold,10);
    cylinder(building,.21,.23,1,0,86,0,gold,9);
    const statueHead=new T.Mesh(new T.SphereGeometry(.33,10,8),gold);
    statueHead.position.set(0,86.55,0);
    building.add(statueHead);
    mergeLandmark(building);
  }

  function terrace(scene) {
    const record=D.houses.find(h=>h[1]==='Monona Terrace');
    if(!record) return;
    const poly=record[4];
    roofLevels.set(poly,27);
    const mass=batch(), roof=batch(), trim=batch();
    const limestone=new T.Color(0xd8c7ac), band=new T.Color(0xf2dfbf);
    const blue=new T.Color(0x718e8a), glass=new T.Color(0x365b60);
    for (const outline of poly) for (let i=0;i<outline.length;i++) {
      const [x,z]=outline[i], [nx,nz]=outline[(i+1)%outline.length];
      if (Math.hypot(x-nx,z-nz)<.1) continue;
      const wall=(target,low,high,color)=>target.quad([x,low,z],[nx,low,nz],[nx,high,nz],[x,high,z],color);
      wall(mass,2,25,limestone);
      wall(trim,7,11,glass);
      wall(trim,14,16.5,glass);
      wall(trim,17,18.1,blue);
      wall(trim,23.6,25.2,band);
    }
    fill(roof,poly,()=>25.45,blue);
    scene.add(mass.mesh(surfaceMaterial()),roof.mesh(surfaceMaterial()));
    scene.add(trim.mesh(surfaceMaterial({polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})));
    const cream=new T.MeshLambertMaterial({color:0xe9dbc2});
    const grass=new T.MeshLambertMaterial({color:0x83946c});
    for (const [x,z,r] of [[375,307,8],[301,398,8],[337,350,14],[320,361,8],[350,333,7]]) {
      cylinder(scene,r,r,1,x,25.7,z,cream,24);
      cylinder(scene,r-.6,r-.6,.15,x,26.25,z,grass,24);
    }
  }

  function waterscape(scene) {
    const water=batch();
    const color=new T.Color(0xffffff);
    for(const {poly,level} of waters) fill(water,poly,()=>level,color);
    return MadisonAtmosphere.create(scene,water,D.bounds,D.water);
  }

  function carModel(scene) {
    const group=new T.Group();
    const finish=new T.MeshPhysicalMaterial({color:0xa44733,metalness:.38,roughness:.36,clearcoat:.71,
      clearcoatRoughness:.28,side:T.DoubleSide});
    const glass=new T.MeshStandardMaterial({color:0x365365,metalness:.24,roughness:.26,side:T.DoubleSide});
    const rubber=new T.MeshStandardMaterial({color:0x262725,roughness:.93});
    const silver=new T.MeshStandardMaterial({color:0xb6bdc3,roughness:.3,metalness:.47});
    const red=new T.MeshStandardMaterial({color:0xff482f,emissive:0xda1d0b,emissiveIntensity:.50,roughness:.24});
    const cream=new T.MeshStandardMaterial({color:0xffefcf,emissive:0xffd18c,emissiveIntensity:.24});

    function shell(sections,material) {
      const vertices=[], indices=[];
      for(const [z,w,low,high] of sections) {
        const blend=high-low;
        vertices.push(-w*.86,low,z, -w,low+blend*.25,z, -w*.94,high-blend*.21,z,
          -w*.76,high,z, w*.76,high,z, w*.94,high-blend*.21,z, w,low+blend*.25,z, w*.86,low,z);
      }
      for(let row=0;row<sections.length-1;row++) for(let column=0;column<8;column++) {
        const a=row*8+column,b=row*8+(column+1)%8;
        indices.push(a,b,b+8,a,b+8,a+8);
      }
      const end=(sections.length-1)*8;
      for(let i=1;i<7;i++) indices.push(0,i+1,i,end,end+i,end+i+1);
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      group.add(new T.Mesh(geometry,material));
    }

    shell([[-2.18,.76,.43,.63],[-2.02,.90,.39,.76],[-1.58,.96,.36,.82],[-.86,.94,.37,.87],
      [.48,.94,.36,.89],[1.43,.97,.37,.89],[2.06,.88,.43,.80],[2.16,.73,.47,.73]],finish);
    shell([[-.95,.79,.76,.86],[-.34,.74,.83,1.35],[.04,.70,.87,1.44],[.63,.69,.87,1.41],
      [.93,.74,.85,1.29],[1.51,.76,.84,.91]],glass);
    shell([[-.34,.56,1.33,1.36],[.04,.58,1.41,1.46],[.63,.57,1.39,1.43],[.92,.57,1.26,1.29]],finish);
    box(group,1.51,.12,4.19,0,.38,0,rubber);
    box(group,1.45,.11,.09,0,.50,2.155,rubber);
    box(group,1.36,.09,.08,0,.49,-2.14,rubber);
    for(const sign of [-1,1]) {
      const x=sign*.97;
      for(const z of [-1.34,1.30]) {
        cylinder(group,.335,.335,.21,x,.335,z,rubber,21).rotation.z=Math.PI/2;
        cylinder(group,.184,.184,.222,x,.335,z,silver,19).rotation.z=Math.PI/2;
        cylinder(group,.071,.071,.233,x,.335,z,rubber,12).rotation.z=Math.PI/2;
      }
      box(group,.47,.095,.045,x*.58,.695,2.137,red).rotation.y=sign*.12;
      box(group,.38,.10,.055,x*.64,.64,-2.139,cream).rotation.y=sign*-.15;
      box(group,.18,.083,.25,x*.92,1.01,-.50,finish).rotation.y=sign*.21;
      box(group,.055,.31,.075,x*.74,1.17,.42,finish).rotation.z=-sign*.20;
      cylinder(group,.056,.060,.17,x*.58,.423,2.155,silver,12).rotation.x=Math.PI/2;
    }
    const plaque=document.createElement('canvas');
    plaque.width=128;
    plaque.height=64;
    const plate=plaque.getContext('2d');
    plate.fillStyle='#e7dabc'; plate.fillRect(0,0,128,64);
    plate.strokeStyle='#3c433d'; plate.strokeRect(4,4,120,56);
    plate.textAlign='center'; plate.fillStyle='#933d31'; plate.font='bold 12px sans-serif';
    plate.fillText('WISCONSIN',64,16);
    plate.fillStyle='#23354f'; plate.font='bold 29px monospace'; plate.fillText('ISTHMUS',64,47);
    const plateMap=new T.CanvasTexture(plaque);
    plateMap.colorSpace=T.SRGBColorSpace;
    const tag=new T.Mesh(new T.PlaneGeometry(.405,.198),new T.MeshLambertMaterial({map:plateMap}));
    tag.position.set(0,.644,2.19);
    group.add(tag);

    const soft=document.createElement('canvas');
    soft.width=soft.height=64;
    const shadow=soft.getContext('2d');
    const fade=shadow.createRadialGradient(32,32,11,32,32,31);
    fade.addColorStop(0,'#10151bc2');
    fade.addColorStop(.65,'#10151b72');
    fade.addColorStop(1,'#10151b00');
    shadow.fillStyle=fade;
    shadow.fillRect(0,0,64,64);
    const contact=new T.Mesh(new T.PlaneGeometry(2.95,5.5),new T.MeshBasicMaterial({
      map:new T.CanvasTexture(soft),transparent:true,depthWrite:false
    }));
    contact.rotation.x=-Math.PI/2;
    contact.position.y=.047;
    group.add(contact);
    group.visible=false;
    scene.add(group);
    return group;
  }

  async function create(host) {
    const photos=await aerialTextures();
    const renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
    const gl=renderer.getContext();
    const gpu=gl.getExtension('WEBGL_debug_renderer_info');
    const software=gpu && /swiftshader|llvmpipe|software/i.test(gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL));
    let resolution=software ? .68 : Math.min(window.devicePixelRatio || 1,1.35);
    renderer.setPixelRatio(resolution);
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.18;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=software?T.BasicShadowMap:T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate=false;
    host.append(renderer.domElement);
    const scene=new T.Scene();
    scene.fog=new T.FogExp2(0xc1c7b8,.00043);
    const camera=new T.PerspectiveCamera(57,1,.26,10800);
    const hemisphere=new T.HemisphereLight(0xe4ece6,0x7e7157,1.63);
    const sun=new T.DirectionalLight(0xffe4bd,2.13);
    const fillLight=new T.DirectionalLight(0xc1d6ed,.51);
    fillLight.position.set(.63,.54,.95);
    sun.castShadow=true;
    sun.shadow.mapSize.setScalar(software?1024:2048);
    sun.shadow.camera.left=sun.shadow.camera.bottom=-380;
    sun.shadow.camera.right=sun.shadow.camera.top=380;
    sun.shadow.camera.far=1530;
    sun.shadow.bias=-.00016;
    sun.shadow.normalBias=.16;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(hemisphere,sun,sun.target,fillLight);
    const atmosphere=waterscape(scene);
    const evening={value:0};
    const wind={value:0};
    worldSurface(scene,photos);
    const layout=streetLayout();
    const stencils=asphalt(scene,layout.signals);
    const data=D;
    const geo={data,ground,nearestRoad,inBuilding,onWater,random,clamp,batch,box,cylinder,mergeLandmark,
      area,center,bounds,inPolygon,indexGrid,segmentDistance,chunkedBatch,triangulate,roofLevels,pavingMaterial,fill,
      streetCandidates:(x,z)=>roadGrid.at(x,z)};
    const stationLighting=MadisonStreetscape.create(scene,{...layout,stencils},geo,wind);
    const lightStreet=streetLights(scene);
    const homes=MadisonHomes.create(scene,geo,evening);
    const stadium=MadisonPlaces.create(scene,geo);
    cityBlocks(scene,photos,evening,homes,stadium);
    capitol(scene);
    terrace(scene);
    const landscape=MadisonLandscape.create(scene,geo,photos,wind,homes);
    const car=carModel(scene);
    const detail=[];
    scene.traverse(mesh=>{
      if(mesh.userData.range) detail.push([mesh,mesh.boundingSphere || mesh.geometry.boundingSphere,mesh.userData.range]);
    });

    let mood;
    let shadowX=Infinity, shadowZ=Infinity, shadowSpan=380;
    function setLight(i) {
      mood=atmosphere.setLight(i);
      sun.color.set(mood.warmth);
      shadowX=shadowZ=Infinity;
      sun.intensity=mood.sun;
      hemisphere.intensity=mood.fill;
      hemisphere.color.set(mood.ambient);
      hemisphere.groundColor.set(mood.bounce);
      fillLight.intensity=i===1?.64:i===2?.37:.22;
      scene.fog.color.set(mood.fog);
      scene.fog.density=mood.density;
      renderer.toneMappingExposure=mood.exposure;
      evening.value=i===2?.85:i===1?.15:0;
      lightStreet(evening.value);
      stationLighting(evening.value);
      stadium?.(evening.value);
    }
    function resize() {
      renderer.setSize(host.clientWidth,host.clientHeight,false);
      camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);
      camera.updateProjectionMatrix();
    }
    setLight(1);
    resize();
    window.addEventListener('resize',resize);
    let frameTime=1/60, lastFrame=0, resolutionCheck=0, reflectionQuality=!software;
    const viewDirection=new T.Vector3();
    return {camera,car,canvas:renderer.domElement,setLight,render(seconds,player=null) {
      const elapsed=lastFrame?seconds-lastFrame:0;
      lastFrame=seconds;
      if(elapsed>0) frameTime=mix(frameTime,Math.min(.2,elapsed),.10);
      if(player && seconds>resolutionCheck) {
        resolutionCheck=seconds+3;
        if(frameTime>.065 && resolution>.58) {
          resolution=Math.max(.58,resolution*.82);
          renderer.setPixelRatio(resolution);
          resize();
        }
      }
      const [x,z,height]=player || [90,35,180];
      const near=height>20?clamp((height-6)*.026,.44,5.6):.22;
      if(Math.abs(near-camera.near)>.14) {
        camera.near=near;
        camera.updateProjectionMatrix();
      }
      for(const [mesh,sphere,range] of detail) {
        const drawDistance=range*(software?.7:1)+sphere.radius+
          Math.max(0,height-65)*(range>=1000?2.95:.47);
        mesh.visible=!player || (sphere.center.x-x)**2+(sphere.center.z-z)**2<drawDistance**2;
      }
      const direction=camera.getWorldDirection(viewDirection);
      const ahead=Math.max(0,height-65)*.61;
      const sx=clamp(x+direction.x*ahead,west,east), sz=clamp(z+direction.z*ahead,north,south);
      const span=height<55?206:380;
      if(span!==shadowSpan) {
        shadowSpan=span;
        sun.shadow.camera.left=sun.shadow.camera.bottom=-span;
        sun.shadow.camera.right=sun.shadow.camera.top=span;
        sun.shadow.camera.updateProjectionMatrix();
        shadowX=shadowZ=Infinity;
      }
      if(Math.hypot(sx-shadowX,sz-shadowZ)>span*.18) {
        shadowX=sx;
        shadowZ=sz;
        sun.target.position.set(sx,11,sz);
        sun.position.copy(mood.sunDirection).multiplyScalar(850).add(sun.target.position);
        renderer.shadowMap.needsUpdate=true;
      }
      const nearLake=!player || height>26 || lakeName(x+direction.x*100,z+direction.z*100);
      wind.value=seconds;
      landscape(player,camera,software || frameTime>.063);
      if(frameTime>.073) reflectionQuality=false;
      if(!software && frameTime<.034) reflectionQuality=true;
      atmosphere.render(renderer,camera,seconds,reflectionQuality && Boolean(nearLake));
      renderer.render(scene,camera);
    }};
  }

  window.MadisonWorld={create,ground,blocked,nearestRoad,inPolygon,center,area,onWater,flightFloor,lakeName};
})();
