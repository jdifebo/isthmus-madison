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
  for (const [,,,,polygon] of D.houses) buildings.add(bounds(polygon[0]),polygon,3);
  const waterAreas = indexGrid(200);
  for (const polygon of D.water) waterAreas.add(bounds(polygon[0]),polygon);
  const onWater = (x,z) => waterAreas.at(x,z).some(polygon=>inPolygon(x,z,polygon));
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
    function quad(a,b,c,d,color,width=1,height=1) {
      triangle(a,b,c,color,[[0,0],[width,0],[width,height]]);
      triangle(a,c,d,color,[[0,0],[width,height],[0,height]]);
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
      mesh(material,cast=false) {
        const group=new T.Group();
        for(const chunk of chunks.values()) {
          const mesh=chunk.mesh(material);
          mesh.geometry.computeBoundingSphere();
          mesh.castShadow=cast;
          mesh.receiveShadow=true;
          mesh.userData.range=1780;
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

  function worldSurface(scene) {
    const land=new T.PlaneGeometry(east-west,south-north,columns,rows);
    land.rotateX(-Math.PI/2);
    land.translate((west+east)/2,0,(north+south)/2);
    const points=land.getAttribute('position');
    const colors=[];
    const color=new T.Color();
    for (let i=0;i<points.count;i++) {
      const x=points.getX(i), z=points.getZ(i), y=terrain[i]/16;
      points.setY(i,y);
      const dense=clamp(1-Math.min(Math.abs(z),Math.hypot(x,z)*.35)/590,0,1)*.78;
      color.set(0x81936a).lerp(new T.Color(0xaaa18a),dense);
      color.multiplyScalar(.95+.06*Math.sin(x*.021+z*.012)+.025*Math.sin(z*.049));
      if (Math.abs(x)<97 && Math.abs(z)<90) color.set(0x7a915d).multiplyScalar(.96+.05*Math.sin(x*.055+z*.038));
      colors.push(color.r,color.g,color.b);
    }
    land.computeVertexNormals();
    land.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const material=surfaceMaterial();
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 field;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfield = position.xz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 field;')
        .replace('#include <color_fragment>',
          '#include <color_fragment>\nfloat textureNoise = fract(sin(dot(floor(field*10.0),vec2(139.45,29.17)))*43758.53); diffuseColor.rgb *= .94+.10*textureNoise;');
    };
    const landMesh=new T.Mesh(land,material);
    landMesh.receiveShadow=true;
    scene.add(landMesh);
    const surround = new T.Mesh(new T.PlaneGeometry(52000,52000),new T.MeshLambertMaterial({color:0x778868}));
    surround.rotation.x=-Math.PI/2;
    surround.position.y=-3;
    scene.add(surround);

    const turf=batch();
    for (const [name,poly] of D.parks) {
      if (name === 'State Street/Mall Concourse') continue;
      fill(turf,poly,(x,z)=>ground(x,z)+0.05,new T.Color(0x79965b));
    }
    const parkMesh=turf.mesh(surfaceMaterial({polygonOffset:true,polygonOffsetFactor:-1}));
    scene.add(parkMesh);
  }

  function asphalt(scene) {
    const sidewalk=chunkedBatch(), surfaces=chunkedBatch(), paint=chunkedBatch(), junctions=new Map();
    const walk=new T.Color(0xc8bda6), white=new T.Color(0xecddbe), yellow=new T.Color(0xe9ad46);
    const styles=[0x3f4749,0x525856,0xa38b74,0xb5a78a,0x777870].map(c=>new T.Color(c));

    function roadBand(target,ax,az,bx,bz,half,lift,color,ends=false) {
      const dx=bx-ax, dz=bz-az, length=Math.hypot(dx,dz);
      const sx=-dz/length*half, sz=dx/length*half;
      const steps=Math.max(1,Math.ceil(length/7));
      const vertex=(x,z)=>[x,ground(x,z)+lift,z];
      for (let step=0;step<steps;step++) {
        const a=step/steps, b=(step+1)/steps;
        const x=ax+dx*a,z=az+dz*a,ex=ax+dx*b,ez=az+dz*b;
        target.quad(vertex(x+sx,z+sz),vertex(ex+sx,ez+sz),vertex(ex-sx,ez-sz),vertex(x-sx,z-sz),color);
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

    for (const [name,kind,width,,line] of D.roads) {
      const painted=kind===0 || kind===1 && /Carroll|Mifflin|Pinckney|Main Street|Hamilton|Wilson/.test(name);
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
        roadBand(surfaces,ax,az,bx,bz,width/2,.2,styles[kind],true);
        if (!painted || length<7) continue;
        const start=i===1?5:1;
        const end=length-(i===line.length-1?5:1);
        const marks=(offset,color,size,spacing) => {
          const ox=-dz/length*offset,oz=dx/length*offset;
          for (let m=start;m<end-size;m+=spacing) {
            roadBand(paint,ax+dx*m/length+ox,az+dz*m/length+oz,
              ax+dx*(m+size)/length+ox,az+dz*(m+size)/length+oz,size>5?.085:.065,.236,color);
          }
        };
        marks(0,kind===0?yellow:white,kind===0?5:2.6,kind===0?8.4:8.7);
        if (width>=13) {
          marks(width*.23,white,3.2,10);
          marks(-width*.23,white,3.2,10);
        }
      }
    }
    for(const arms of junctions.values()) {
      if(new Set(arms.map(arm=>arm.name)).size<2) continue;
      for(const {kind,width,x,z,nx,nz} of arms) {
        const length=Math.hypot(nx-x,nz-z);
        if(kind===2||length<7) continue;
        const dx=(nx-x)/length,dz=(nz-z)/length;
        const cx=x+dx*6.1,cz=z+dz*6.1;
        for(let across=-width*.4;across<=width*.4;across+=.78) {
          const px=cx-dz*across,pz=cz+dx*across;
          roadBand(paint,px,pz,px+dx*1.9,pz+dz*1.9,.19,.254,white);
        }
      }
    }
    const pavingMaterial=surfaceMaterial();
    for(const sink of [sidewalk,surfaces,paint]) scene.add(sink.mesh(pavingMaterial));
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
    const cap=new T.MeshLambertMaterial({color:0xe1d6ac,emissive:0x675138,emissiveIntensity:.36});
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
  }

  function facadeTexture() {
    const tile=document.createElement('canvas');
    tile.width=128;
    tile.height=128;
    const ctx=tile.getContext('2d');
    const noise=random(821);
    ctx.fillStyle='#f5efe2';
    ctx.fillRect(0,0,128,128);
    for (let i=0;i<800;i++) {
      const light=noise()>.5?255:92;
      ctx.fillStyle='rgba('+[light,light,light,noise()*.18].join(',')+')';
      ctx.fillRect(noise()*128,noise()*128,1+noise()*10,1+noise()*2);
    }
    ctx.fillStyle='#d0c5b7';
    ctx.fillRect(0,7,128,3);
    ctx.fillRect(0,114,128,4);
    ctx.fillStyle='#f9f2e0';
    ctx.fillRect(0,118,128,3);
    ctx.fillStyle='#a49d91';
    ctx.fillRect(27,24,74,67);
    ctx.fillStyle='#6f726b';
    ctx.fillRect(32,27,64,59);
    const glass=ctx.createLinearGradient(0,28,8,86);
    glass.addColorStop(0,'#87999c');
    glass.addColorStop(.38,'#637a7e');
    glass.addColorStop(1,'#33474c');
    ctx.fillStyle=glass;
    ctx.fillRect(36,31,56,51);
    ctx.fillStyle='#9ea8a3';
    ctx.fillRect(62,30,3,52);
    ctx.fillRect(35,50,58,2);
    ctx.fillStyle='#e6ded0';
    ctx.fillRect(25,88,78,4);
    const texture=new T.CanvasTexture(tile);
    texture.colorSpace=T.SRGBColorSpace;
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.anisotropy=4;
    return texture;
  }

  const knownHeights={
    'Overture Center':23, 'Memorial Union':23, 'State Historical Society':26,
    'Chazen Museum of Art':20, 'Madison Central Library':18, 'Kohl Center':27,
    'Madison Municipal Building':20, 'City-County Building':36
  };

  function cityBlocks(scene) {
    const walls=chunkedBatch(), roofs=chunkedBatch(), foundations=chunkedBatch(), trims=chunkedBatch();
    const stone=[0xb4937d,0xb4a48e,0xcebd9e,0xa98470,0xcfc7b4,0x8eaaa8,0xa7b3a1,0x9a786b];
    const home=[0xc5ab89,0xaaa998,0xb7876b,0xc2bd9f,0x9aa897,0xd1c5a7,0xbfa997];
    for (const [id,name,kind,measured,poly] of D.houses) {
      if (name==='Wisconsin State Capitol' || name==='Monona Terrace') continue;
      const ring=poly[0], [x,z]=center(ring), size=area(ring);
      if (size<4 || x<west-55 || x>east+55 || z<north-55 || z>south+55) continue;
      const rng=random(id*11939);
      const downtown=clamp(1-Math.hypot(x*.76,z*1.85)/800,0,1);
      const estimated=kind===2 ? 3.3+rng()*1.6 : kind===1 ?
        6.2+rng()*4.6+clamp((size-300)/35,0,17)*Math.max(.42,downtown) :
        8+rng()*5+Math.min(Math.sqrt(size)*.36,19)*(downtown*.7+.33)+downtown*rng()*14;
      const height=knownHeights[name] || measured || estimated;
      const base=ground(x,z), top=base+height;
      const palette=kind===0?stone:home;
      const wall=new T.Color(palette[Math.floor(rng()*palette.length)]);
      const roof=wall.clone().lerp(new T.Color(kind===0?0x635e55:0x665c4d),.52);
      const brick=wall.clone().multiplyScalar(.73);

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
          target.quad([ax,floor,az],[bx,floor,bz],[bx,top,bz],[ax,top,az],face,
            Math.max(1,Math.round(length/(kind===1?3.1:3.7))),Math.max(1,Math.round(height/3.25)));
          if (kind===0 && height>8) trims.quad([ax,top-.25,az],[bx,top-.25,bz],[bx,top+.4,bz],[ax,top+.4,az],face.clone().multiplyScalar(1.08));
        }
      }
      const simpleHome=kind===1 && size<250 && ring.length<=10 && poly.length===1 && rng()<.67;
      if (simpleHome) {
        const [points,faces]=triangulate(poly);
        for (const face of faces) {
          const vertices=face.map(i=>[points[i].x,top,points[i].y]);
          const [a,b,c]=vertices;
          const peak=[(a[0]+b[0]+c[0])/3,top+Math.min(2.6,Math.sqrt(size)*.19),(a[2]+b[2]+c[2])/3];
          roofs.triangle(a,peak,b,roof);
          roofs.triangle(b,peak,c,roof);
          roofs.triangle(c,peak,a,roof);
        }
      } else {
        fill(roofs,poly,()=>top,roof);
      }
    }
    scene.add(walls.mesh(surfaceMaterial({map:facadeTexture()}),true));
    const buildingMaterial=surfaceMaterial();
    for (const sink of [roofs,foundations,trims]) scene.add(sink.mesh(buildingMaterial,sink===roofs));
  }

  function capitol(scene) {
    const [, , , ,poly]=D.houses.find(h=>h[1]==='Wisconsin State Capitol');
    const [x,z]=center(poly[0]);
    const y=ground(x,z);
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
    const plazaMesh=plaza.mesh(surfaceMaterial());
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
    const [,,,,poly]=D.houses.find(h=>h[1]==='Monona Terrace');
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

  function foliage(scene) {
    const chunks = new Map();
    const rng=random(5399);
    function plant(x,z,h,r) {
      const key=Math.floor(x/240)+','+Math.floor(z/240);
      if(!chunks.has(key)) chunks.set(key,[]);
      chunks.get(key).push([x,ground(x,z),z,h,r,rng()]);
    }
    for (const [x,z] of D.trees) {
      if (x<west || x>east || z<north || z>south || inBuilding(x,z,1) || onWater(x,z)) continue;
      if (rng()<.18) continue;
      const h=4.1+rng()*6.1, width=1.65+rng()*1.7;
      plant(x,z,h,width);
    }
    for (const [x,z] of [[-76,32],[-71,-35],[-33,77],[36,70],[72,28],[75,-37],[34,-77],[-32,-79]]) {
      plant(x,z,8+rng()*2.5,2.8+rng());
    }
    const base=new T.MeshLambertMaterial({color:0xffffff,flatShading:true});
    const trunkShape=new T.CylinderGeometry(.13,.23,1,5);
    const crownShape=new T.IcosahedronGeometry(1,1), distantShape=new T.IcosahedronGeometry(1,0);
    const dummy=new T.Object3D(), color=new T.Color();
    for(const entries of chunks.values()) {
      const trunks=new T.InstancedMesh(trunkShape,base,entries.length);
      const crowns=new T.InstancedMesh(crownShape,base,entries.length);
      const second=new T.InstancedMesh(distantShape,base,entries.length);
      for (let i=0;i<entries.length;i++) {
        const [x,y,z,h,r,shade]=entries[i];
        dummy.position.set(x,y+h*.31,z);
        dummy.scale.set(1,h*.65,1);
        dummy.updateMatrix();
        trunks.setMatrixAt(i,dummy.matrix);
        trunks.setColorAt(i,color.set(0x625749));
        dummy.rotation.y=shade*12;
        dummy.position.set(x,y+h*.76,z);
        dummy.scale.set(r*.88,h*.33,r);
        dummy.updateMatrix();
        crowns.setMatrixAt(i,dummy.matrix);
        crowns.setColorAt(i,color.setHSL(.23+shade*.07,.28+shade*.13,.28+shade*.12));
        dummy.position.set(x+r*.48,y+h*.64,z-r*.19);
        dummy.scale.set(r*.63,h*.24,r*.68);
        dummy.updateMatrix();
        second.setMatrixAt(i,dummy.matrix);
        second.setColorAt(i,color.offsetHSL(-.03,0,.048));
      }
      for (const [mesh,range] of [[trunks,470],[crowns,1250],[second,780]]) {
        mesh.computeBoundingSphere();
        mesh.userData.range=range;
        scene.add(mesh);
      }
    }
  }

  function lake(scene) {
    const water = batch();
    for (const poly of D.water) {
      const isMendota=inPolygon(-1080,-680,poly);
      const isMonona=inPolygon(660,800,poly);
      const level=isMendota?3.35:isMonona?2.33:2.05;
      fill(water,poly,()=>level,new T.Color(0xffffff));
    }
    const uniforms=T.UniformsUtils.merge([T.UniformsLib.fog,{
      time:{value:0}, deep:{value:new T.Color(0x346c76)}, shallow:{value:new T.Color(0x86a3a1)},
      sun:{value:new T.Vector3(-.7,.4,.25)}
    }]);
    const material=new T.ShaderMaterial({
      uniforms, fog:true,side:T.DoubleSide,
      vertexShader:[
        'varying vec3 surface;', '#include <fog_pars_vertex>',
        'void main(){surface=position; vec4 mvPosition=modelViewMatrix*vec4(position,1.);',
        'gl_Position=projectionMatrix*mvPosition;', '#include <fog_vertex>', '}'
      ].join('\n'),
      fragmentShader:[
        'uniform float time; uniform vec3 deep, shallow, sun; varying vec3 surface;', '#include <fog_pars_fragment>',
        'void main(){ vec2 p=surface.xz;',
        'float swell=sin(p.x*.071+p.y*.054-time*.54);',
        'float wave=sin(p.x*.39+p.y*.32+time*1.17+swell) + .51*sin(p.x*.14-p.y*.59-time*.94+swell*1.6) + .21*sin(p.x*.63+p.y*.81+time*1.71);',
        'vec3 eye=normalize(cameraPosition-surface); float horizon=pow(1.-max(0.,eye.y),2.7);',
        'vec3 color=mix(deep,shallow,horizon*.63+.11+wave*.035+swell*.018);',
        'vec3 normal=normalize(vec3(.047*sin(p.x*.36+p.y*.12+time),1.,.04*sin(p.y*.59-time*1.3)));',
        'float shine=pow(max(0.,dot(reflect(-sun,normal),eye)),115.);',
        'color += (shine*.52 + max(0.,wave-.95)*.042)*vec3(1.,.87,.67);',
        'gl_FragColor=vec4(color,1.);', '#include <fog_fragment>', '#include <tonemapping_fragment>',
        '#include <colorspace_fragment>', '}'
      ].join('\n')
    });
    scene.add(water.mesh(material));
    return uniforms;
  }

  function sky(scene) {
    const uniforms={
      top:{value:new T.Color(0x62aabd)}, haze:{value:new T.Color(0xe1dbbe)},
      sun:{value:new T.Vector3()}, cloud:{value:new T.Color(0xfff3e0)}, time:{value:0}
    };
    const material=new T.ShaderMaterial({
      uniforms,side:T.BackSide,depthWrite:false,
      vertexShader:'varying vec3 ray; void main(){ray=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:[
        'uniform vec3 top,haze,sun,cloud; uniform float time; varying vec3 ray;',
        'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
        'float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',
        'void main(){vec3 d=normalize(ray); float h=max(d.y,0.);',
        'vec3 color=mix(haze,top,1.-exp(-3.9*h)); float glow=max(0.,dot(d,sun));',
        'color+=pow(glow,11.)*vec3(.24,.14,.045) + smoothstep(.99958,.99991,glow)*vec3(.92,.73,.41);',
        'vec2 uv=d.xz*(1.4/max(.05,h))+vec2(time*.001,0.); uv.x *= 1.9;',
        'float f=noise(uv)*.56+noise(uv*2.1)*.25+noise(uv*4.4)*.13+noise(uv*8.5)*.06;',
        'float clouds=smoothstep(.48,.73,f)*smoothstep(.035,.15,h)*.65;',
        'color=mix(color,cloud,clouds); gl_FragColor=vec4(color,1.);',
        '#include <tonemapping_fragment>', '#include <colorspace_fragment>', '}'
      ].join('\n')
    });
    const mesh=new T.Mesh(new T.SphereGeometry(7200,26,16),material);
    mesh.renderOrder=-10;
    scene.add(mesh);
    return {mesh,uniforms};
  }

  function carModel(scene) {
    const group=new T.Group();
    const body=new T.MeshLambertMaterial({color:0xe6ae57});
    const roof=new T.MeshLambertMaterial({color:0xf1c471});
    const black=new T.MeshLambertMaterial({color:0x232827});
    const glass=new T.MeshLambertMaterial({color:0x536e71});
    const silver=new T.MeshLambertMaterial({color:0xb4ae98});
    const red=new T.MeshBasicMaterial({color:0xde6250});
    const cream=new T.MeshBasicMaterial({color:0xffedca});
    box(group,1.92,.54,4.24,0,.65,0,body);
    box(group,1.78,.28,4.4,0,.43,0,black);
    box(group,1.72,.56,1.96,0,1.09,.20,glass);
    box(group,1.79,.11,1.97,0,1.4,.20,roof);
    box(group,1.84,.22,1.1,0,.81,-1.41,roof);
    box(group,1.82,.14,.72,0,.89,1.61,body);
    for (const x of [-.99,.99]) {
      for (const z of [-1.36,1.30]) {
        cylinder(group,.32,.32,.22,x,.34,z,black,14).rotation.z=Math.PI/2;
        cylinder(group,.17,.17,.229,x,.34,z,silver,12).rotation.z=Math.PI/2;
      }
      box(group,.33,.15,.05,x*.72,.72,2.135,red);
      box(group,.33,.16,.05,x*.72,.72,-2.145,cream);
      box(group,.14,.12,.22,x,1.04,-.55,black);
      box(group,.043,.49,.095,x*.88,1.12,.28,body);
    }
    box(group,.55,.12,.06,0,.53,2.22,cream);
    const contact=new T.Mesh(new T.PlaneGeometry(2.15,4.6),new T.MeshBasicMaterial({color:0x17201c,transparent:true,opacity:.34,depthWrite:false}));
    contact.rotation.x=-Math.PI/2;
    contact.position.y=.035;
    group.add(contact);
    group.visible=false;
    scene.add(group);
    return group;
  }

  function create(host) {
    const renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
    const gl=renderer.getContext();
    const gpu=gl.getExtension('WEBGL_debug_renderer_info');
    const software=gpu && /swiftshader|llvmpipe|software/i.test(gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL));
    let resolution=software?.63:Math.min(window.devicePixelRatio || 1,1.55);
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
    const camera=new T.PerspectiveCamera(57,1,.17,8400);
    const hemisphere=new T.HemisphereLight(0xe4ece6,0x7e7157,1.63);
    const sun=new T.DirectionalLight(0xffe4bd,2.13);
    sun.castShadow=true;
    sun.shadow.mapSize.setScalar(software?1024:2048);
    sun.shadow.camera.left=sun.shadow.camera.bottom=-240;
    sun.shadow.camera.right=sun.shadow.camera.top=240;
    sun.shadow.camera.far=1100;
    sun.shadow.bias=-.00031;
    sun.shadow.normalBias=.21;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(hemisphere,sun,sun.target);
    const skyline=sky(scene);
    worldSurface(scene);
    const waves=lake(scene);
    asphalt(scene);
    streetLights(scene);
    cityBlocks(scene);
    capitol(scene);
    terrace(scene);
    foliage(scene);
    const car=carModel(scene);
    const detail=[];
    scene.traverse(mesh=>{
      if(mesh.userData.range) detail.push([mesh,mesh.boundingSphere || mesh.geometry.boundingSphere,mesh.userData.range]);
    });

    const themes=[
      [0x4293bc,0xe0dcc4,0xc2caca,0xffe9cd,[-.63,.66,.44],2.05,1.43,0x316879,0x8fb6b6],
      [0x718ca5,0xffc68b,0xccad91,0xffc085,[-.85,.26,.28],2.28,1.25,0x415b71,0xa69a85],
      [0x29416c,0x92889b,0x777f91,0xb0bddc,[-.55,.43,-.69],1.05,1.13,0x263c56,0x657b95]
    ];
    let shadowX=Infinity, shadowZ=Infinity;
    function setLight(i) {
      const [top,haze,fog,color,direction,direct,ambient,deep,shallow]=themes[i];
      skyline.uniforms.top.value.set(top);
      skyline.uniforms.haze.value.set(haze);
      skyline.uniforms.cloud.value.set(i===2?0x8e9db5:0xfff2d8);
      skyline.uniforms.sun.value.set(...direction).normalize();
      waves.sun.value.copy(skyline.uniforms.sun.value);
      waves.deep.value.set(deep);
      waves.shallow.value.set(shallow);
      sun.color.set(color);
      shadowX=shadowZ=Infinity;
      sun.intensity=direct;
      hemisphere.intensity=ambient;
      hemisphere.color.set(i===2?0xb7c6e6:0xe5ece4);
      scene.fog.color.set(fog);
    }
    function resize() {
      renderer.setSize(host.clientWidth,host.clientHeight,false);
      camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);
      camera.updateProjectionMatrix();
    }
    setLight(0);
    resize();
    window.addEventListener('resize',resize);
    let frameTime=1/60, lastFrame=0, resolutionCheck=0;
    return {camera,car,canvas:renderer.domElement,setLight,render(seconds,player=null) {
      const elapsed=lastFrame?seconds-lastFrame:0;
      lastFrame=seconds;
      if(elapsed>0 && elapsed<.8) frameTime=mix(frameTime,elapsed,.09);
      if(player && seconds>resolutionCheck) {
        resolutionCheck=seconds+3;
        if(frameTime>.065 && resolution>.58) {
          resolution=Math.max(.58,resolution*.82);
          renderer.setPixelRatio(resolution);
          resize();
        }
      }
      skyline.mesh.position.copy(camera.position);
      skyline.uniforms.time.value=waves.time.value=seconds;
      const [x,z]=player || [90,35];
      for(const [mesh,sphere,range] of detail) {
        const drawDistance=range*(software?.65:1)+sphere.radius;
        mesh.visible=!player || (sphere.center.x-x)**2+(sphere.center.z-z)**2<drawDistance**2;
      }
      if(Math.hypot(x-shadowX,z-shadowZ)>56) {
        shadowX=x;
        shadowZ=z;
        sun.target.position.set(x,0,z);
        sun.position.copy(skyline.uniforms.sun.value).multiplyScalar(600).add(sun.target.position);
        renderer.shadowMap.needsUpdate=true;
      }
      renderer.render(scene,camera);
    }};
  }

  window.MadisonWorld={create,ground,blocked,nearestRoad,inPolygon,center,area,onWater};
})();
