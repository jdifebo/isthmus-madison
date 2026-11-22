(() => {
  'use strict';

  const T=THREE;
  const sidingColors=[0xa6aaa0,0xc4b7a2,0x81978f,0xc4a077,0xa37264,0x9caab7,0xe0ceaa,0x839679,0xb3a8a2];
  const masonryColors=[0xaf715c,0xb98972,0xd0b195,0x956555,0xccb99f];
  const roofColors=[0x6c6f72,0x665a55,0x7d7568,0x625957,0x575f65,0x746b66];
  const doorColors=[0x57736a,0x8a504a,0x826145,0x4f626c,0x435451,0x8d744c];
  const pick=(range,rng)=>range[Math.floor(rng()*range.length)];

  function surfaceTexture(type,random) {
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');
    const rng=random(7298+type*621);
    ctx.fillStyle=type===2?'#aaa4a0':'#ece9e1';
    ctx.fillRect(0,0,256,256);
    const gray=(value)=>'rgb('+value+','+value+','+value+')';
    if(type===2) {
      const row=32,column=64;
      for(let y=0;y<256;y+=row) {
        for(let x=-column+(y/row%2)*32;x<256;x+=column) {
          const k=Math.round(151+rng()*75);
          ctx.fillStyle=gray(k);
          ctx.fillRect(x,y,column-.8,row);
          ctx.fillStyle='#1a171835';
          ctx.fillRect(x+1,y+1,column-2,3);
          ctx.fillStyle='#e8ded257';
          ctx.fillRect(x+1,y+row-2,column-2,1);
        }
      }
    } else if(type===1) {
      ctx.fillStyle='#a6a195';
      ctx.fillRect(0,0,256,256);
      for(let row=0;row<12;row++) {
        for(let x=-43+(row%2)*21.5;x<256;x+=43) {
          const level=Math.round(176+rng()*70);
          ctx.fillStyle=gray(level);
          ctx.fillRect(x,row*21.333+1,41,19.3);
          ctx.fillStyle='#48413933';
          ctx.fillRect(x,row*21.333+18.5,41,1.2);
        }
      }
    } else if(type===0) {
      for(let y=0;y<256;y+=32) {
        const siding=ctx.createLinearGradient(0,y,0,y+32);
        siding.addColorStop(0,'#e9e5dd');
        siding.addColorStop(.12,'#fffaf0');
        siding.addColorStop(.87,'#ddd6c7');
        siding.addColorStop(.98,'#ada395');
        ctx.fillStyle=siding;
        ctx.fillRect(0,y,256,32);
      }
      for(let i=0;i<180;i++) {
        ctx.fillStyle=rng()<.5?'#6b584c2c':'#ffffff38';
        ctx.fillRect(rng()*256,rng()*256,12+rng()*88,1);
      }
    }
    for(let i=0;i<(type===2?9600:3800);i++) {
      ctx.fillStyle=rng()<.53?'#ffffff2e':'#27251f26';
      ctx.fillRect(rng()*256,rng()*256,.45+rng()*2.8,.55+rng()*2);
    }
    const texture=new T.CanvasTexture(canvas);
    texture.colorSpace=T.SRGBColorSpace;
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.anisotropy=6;
    return texture;
  }

  function joineryMaterial(evening) {
    const canvas=document.createElement('canvas');
    canvas.width=1024;
    canvas.height=256;
    const ink=canvas.getContext('2d');
    function glass(x,y,w,h) {
      const sky=ink.createLinearGradient(x,y,x+w*.35,y+h);
      sky.addColorStop(0,'#99bcc6');
      sky.addColorStop(.38,'#678995');
      sky.addColorStop(.72,'#486272');
      sky.addColorStop(1,'#263d50');
      ink.fillStyle=sky;
      ink.fillRect(x,y,w,h);
      ink.fillStyle='#ffefe333';
      ink.beginPath();
      ink.moveTo(x,y);
      ink.lineTo(x+w*.74,y);
      ink.lineTo(x,y+h*.83);
      ink.fill();
    }
    for(let kind=0;kind<8;kind++) {
      ink.save();
      ink.translate(kind*128,0);
      const door=kind>=5;
      if(kind===3) {
        ink.beginPath();
        ink.moveTo(3,252);
        ink.lineTo(3,84);
        ink.ellipse(64,84,61,80,0,Math.PI,0,false);
        ink.lineTo(125,252);
        ink.closePath();
        ink.clip();
      }
      ink.fillStyle='#312b29';
      ink.fillRect(0,0,128,256);
      ink.fillStyle=door?'#ede1ce':'#f5ebda';
      ink.fillRect(5,5,118,246);
      if(door) {
        const shade=ink.createLinearGradient(12,0,118,0);
        shade.addColorStop(0,'#9b938c');
        shade.addColorStop(.18,'#e5dfd8');
        shade.addColorStop(.78,'#d1c7bb');
        shade.addColorStop(1,'#8d8178');
        ink.fillStyle=shade;
        ink.fillRect(13,12,103,236);
        const panelTop=kind===5?51:119;
        for(const panelY of [panelTop,165]) {
          const height=panelY===165?66:38;
          for(const panelX of [23,69]) {
            ink.strokeStyle='#695e5581';
            ink.lineWidth=3;
            ink.strokeRect(panelX,panelY,34,height);
            ink.strokeStyle='#fff7e380';
            ink.lineWidth=1;
            ink.strokeRect(panelX+3,panelY+3,28,height-6);
          }
        }
        if(kind!==5) glass(22,24,82,kind===6?70:32);
        if(kind===6) {
          ink.fillStyle='#f4ead9';
          ink.fillRect(47,24,4,69);
          ink.fillRect(76,24,4,69);
        }
        ink.fillStyle='#493f30';
        ink.fillRect(95,125,10,20);
        ink.fillStyle='#c1a465';
        ink.beginPath(); ink.arc(100,133,6,0,Math.PI*2); ink.fill();
      } else {
        glass(13,15,102,223);
        ink.fillStyle='#e8dfce';
        const center=kind===2?167:kind===3?108:kind===4?147:128;
        ink.fillRect(12,center,104,kind===2?6:9);
        if(kind!==2) ink.fillRect(61,14,6,224);
        if(kind===0 || kind===4) {
          ink.fillRect(12,75,104,5);
          ink.fillRect(34,14,4,120);
          ink.fillRect(91,14,4,120);
        }
        if(kind===3) ink.fillRect(12,83,104,4);
        if(kind===1) {
          ink.fillStyle='#e2c79a4f';
          ink.fillRect(14,18,25,107);
          ink.fillRect(89,18,25,107);
        }
      }
      ink.restore();
    }
    const map=new T.CanvasTexture(canvas);
    map.colorSpace=T.SRGBColorSpace;
    map.anisotropy=5;
    const material=new T.MeshLambertMaterial({map,alphaTest:.38,vertexColors:true,side:T.DoubleSide});
    material.onBeforeCompile=shader=>{
      shader.uniforms.evening=evening;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 joineryPosition;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\njoineryPosition=position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
        '#include <common>\nuniform float evening;\nvarying vec3 joineryPosition;')
        .replace('#include <map_fragment>',`
          vec4 joinery=texture2D(map,vMapUv);
          float glass=smoothstep(.023,.142,joinery.b-joinery.r);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86,.91,.94),glass*.73)*joinery.rgb;
          diffuseColor.a*=joinery.a;
          float occupied=fract(sin(dot(floor(joineryPosition*.35),vec3(13.37,89.13,47.11)))*43758.5453);
        `).replace('#include <emissivemap_fragment>',`
          #include <emissivemap_fragment>
          totalEmissiveRadiance+=vec3(.89,.53,.205)*glass*evening*smoothstep(.65,.88,occupied);
        `);
    };
    return material;
  }

  function signedArea(ring) {
    return ring.reduce((sum,[x,z],i)=>{
      const [nextX,nextZ]=ring[(i+1)%ring.length];
      return sum+x*nextZ-z*nextX;
    },0)/2;
  }

  function edge(a,b,winding) {
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    const ux=dx/length,uz=dz/length;
    return {a,b,length,ux,uz,nx:uz*winding,nz:-ux*winding};
  }

  function fitStreet(face,{streetCandidates,segmentDistance}) {
    const mid=face.length*.5,{a,ux,uz,nx,nz}=face;
    const x=a[0]+mid*ux,z=a[1]+mid*uz;
    let choice=null;
    for(const street of streetCandidates(x,z)) {
      if(!street.name || street.kind>1) continue;
      const dx=street.bx-street.ax,dz=street.bz-street.az,length=Math.hypot(dx,dz);
      const alignment=Math.abs((ux*dx+uz*dz)/length);
      if(alignment<.54) continue;
      const t=((x-street.ax)*dx+(z-street.az)*dz)/(length*length);
      const clampT=Math.max(0,Math.min(1,t));
      const sx=street.ax+dx*clampT,sz=street.az+dz*clampT;
      const outward=(sx-x)*nx+(sz-z)*nz;
      const distance=Math.sqrt(segmentDistance(x,z,street.ax,street.az,street.bx,street.bz));
      const gap=outward-street.width*.5-1.45;
      if(outward<distance*.69 || gap<.5 || gap>42) continue;
      const score=gap+(1-alignment)*19+(distance-outward)*2.1+(street.kind===0?1.3:0);
      if(!choice || score<choice.score) choice={street,gap,score};
    }
    return choice;
  }

  function roofPlan(ring,frame,shape,base,rise) {
    const coordinate=(x,z)=>[(x-frame.a[0])*frame.ux+(z-frame.a[1])*frame.uz,
      (x-frame.a[0])*frame.nx+(z-frame.a[1])*frame.nz];
    const corners=ring.map(([x,z])=>coordinate(x,z));
    const xs=corners.map(p=>p[0]),zs=corners.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    const cross=Math.max(1.2,(maxX-minX)*.5);
    const deep=Math.max(1.2,(maxZ-minZ)*.5);
    const sides=[
      {axis:0,value:(x,z)=>(coordinate(x,z)[0]-minX)/cross},
      {axis:0,value:(x,z)=>(maxX-coordinate(x,z)[0])/cross}
    ];
    const ends=[
      {axis:1,value:(x,z)=>(coordinate(x,z)[1]-minZ)/deep},
      {axis:1,value:(x,z)=>(maxZ-coordinate(x,z)[1])/deep}
    ];
    const planes=shape==='hip'?[...sides,...ends]:shape==='side'?ends:sides;
    const at=(x,z)=>base+rise*Math.max(0,Math.min(1,...planes.map(p=>p.value(x,z))));
    return {coordinate,planes,at,high:base+rise};
  }

  function clip(points,signed) {
    const result=[];
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const a=points[j],b=points[i],sa=signed(...a),sb=signed(...b);
      if((sa<0)!==(sb<0)) {
        const t=sa/(sa-sb);
        result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
      }
      if(sb>=0) result.push(b);
    }
    return result;
  }

  function coverRoof(sink,polygon,roof,tint,triangulate) {
    const [points,faces]=triangulate(polygon);
    for(const face of faces) {
      const triangle=face.map(i=>[points[i].x,points[i].y]);
      for(const plane of roof.planes) {
        let area=triangle;
        for(const neighbor of roof.planes) {
          if(neighbor!==plane) area=clip(area,(x,z)=>neighbor.value(x,z)-plane.value(x,z));
        }
        for(let i=1;i<area.length-1;i++) {
          const vertices=[area[0],area[i+1],area[i]];
          const coordinates=vertices.map(([x,z])=>roof.coordinate(x,z));
          const uv=coordinates.map(p=>plane.axis===0?[p[1]*.59,p[0]*.67]:[p[0]*.59,p[1]*.67]);
          sink.triangle(...vertices.map(([x,z])=>[x,roof.at(x,z),z]),tint,uv);
        }
      }
    }
  }

  function wallPoint(face,across,height,out=0) {
    return [face.a[0]+across*face.ux+face.nx*out,height,face.a[1]+across*face.uz+face.nz*out];
  }

  function panel(sink,face,x,y,width,height,out,tint,tile=null) {
    const a=wallPoint(face,x-width/2,y,out),b=wallPoint(face,x+width/2,y,out);
    const c=wallPoint(face,x+width/2,y+height,out),d=wallPoint(face,x-width/2,y+height,out);
    if(tile===null) { sink.quad(a,b,c,d,tint); return; }
    const left=(tile*128+1)/1024,right=(tile*128+127)/1024;
    sink.triangle(a,b,c,tint,[[left,.004],[right,.004],[right,.996]]);
    sink.triangle(a,c,d,tint,[[left,.004],[right,.996],[left,.996]]);
  }

  function prism(sink,face,left,right,back,front,low,high,tint) {
    const a=wallPoint(face,left,low,back),b=wallPoint(face,right,low,back);
    const c=wallPoint(face,right,low,front),d=wallPoint(face,left,low,front);
    const A=wallPoint(face,left,high,back),B=wallPoint(face,right,high,back);
    const C=wallPoint(face,right,high,front),D=wallPoint(face,left,high,front);
    sink.quad(A,D,C,B,tint);
    sink.quad(a,A,B,b,tint);
    sink.quad(b,B,C,c,tint);
    sink.quad(c,C,D,d,tint);
    sink.quad(d,D,A,a,tint);
  }

  function wallsFor(polygon,facades,volume,roofing,roof,bottom,wallTint,baseTint,trimTint,roofTint,ground) {
    for(const ring of polygon) {
      const winding=Math.sign(signedArea(ring))||1;
      const outer=ring===polygon[0];
      function overhang(i) {
        const a=ring[i],before=ring[(i+ring.length-1)%ring.length],after=ring[(i+1)%ring.length];
        if(Math.min(Math.hypot(a[0]-before[0],a[1]-before[1]),Math.hypot(a[0]-after[0],a[1]-after[1]))<.09) return a;
        const left=edge(before,a,winding),right=edge(a,after,winding);
        const length=.29/Math.max(.79,1+left.nx*right.nx+left.nz*right.nz);
        return [a[0]+(left.nx+right.nx)*length,a[1]+(left.nz+right.nz)*length];
      }
      for(let i=0;i<ring.length;i++) {
        const [a,b]=[ring[i],ring[(i+1)%ring.length]];
        if(Math.hypot(b[0]-a[0],b[1]-a[1])<.09) continue;
        const face=edge(a,b,winding);
        const cuts=[0,1];
        for(let p=0;p<roof.planes.length;p++) {
          for(let q=p+1;q<roof.planes.length;q++) {
            const near=roof.planes[p].value(...a)-roof.planes[q].value(...a);
            const far=roof.planes[p].value(...b)-roof.planes[q].value(...b);
            if(near*far<0) cuts.push(near/(near-far));
          }
        }
        cuts.sort((a,b)=>a-b);
        const overA=outer?overhang(i):a,overB=outer?overhang((i+1)%ring.length):b;
        function eave(t,y) {
          const x=overA[0]+(overB[0]-overA[0])*t,z=overA[1]+(overB[1]-overA[1])*t;
          const insideX=2*(a[0]+(b[0]-a[0])*t)-x;
          const insideZ=2*(a[1]+(b[1]-a[1])*t)-z;
          return [x,y+Math.min(0,y-roof.at(insideX,insideZ)),z];
        }
        volume.quad([a[0],Math.min(ground(...a)-.16,bottom-.2),a[1]],
          [b[0],Math.min(ground(...b)-.16,bottom-.2),b[1]],
          [b[0],bottom,b[1]],[a[0],bottom,a[1]],baseTint);
        for(let j=1;j<cuts.length;j++) {
          const u=face.length*cuts[j-1],v=face.length*cuts[j];
          if(v-u<.012) continue;
          const q=wallPoint(face,u,bottom),r=wallPoint(face,v,bottom);
          const qa=roof.at(q[0],q[2]),ra=roof.at(r[0],r[2]);
          const t=wallPoint(face,v,ra),s=wallPoint(face,u,qa);
          facades.triangle(q,r,t,wallTint,[[u*.53,0],[v*.53,0],[v*.53,(ra-bottom)*1.10]]);
          facades.triangle(q,t,s,wallTint,[[u*.53,0],[v*.53,(ra-bottom)*1.10],[u*.53,(qa-bottom)*1.10]]);
          if(!outer) continue;
          const start=eave(cuts[j-1],qa),end=eave(cuts[j],ra);
          roofing.quad(s,start,end,t,roofTint,.25,(v-u)*.63);
          const lowStart=[start[0],start[1]-.15,start[2]],lowEnd=[end[0],end[1]-.15,end[2]];
          volume.quad(start,lowStart,lowEnd,end,trimTint);
          volume.quad(lowStart,wallPoint(face,u,qa-.15),wallPoint(face,v,ra-.15),lowEnd,trimTint);
        }
      }
    }
  }

  function sidewalkPoint(street,x,z) {
    const dx=street.bx-street.ax,dz=street.bz-street.az;
    const length2=dx*dx+dz*dz;
    const t=Math.max(0,Math.min(1,((x-street.ax)*dx+(z-street.az)*dz)/length2));
    const nearX=street.ax+dx*t,nearZ=street.az+dz*t;
    const distance=Math.hypot(x-nearX,z-nearZ);
    return {x:nearX,z:nearZ,nx:(x-nearX)/distance,nz:(z-nearZ)/distance};
  }

  function create(scene,geo,evening) {
    const {data,ground,area,center,inPolygon,inBuilding,bounds,indexGrid,onWater,
      segmentDistance,random,chunkedBatch,triangulate,clamp,roofLevels}=geo;
    const lots=indexGrid(65), assigned=new Map(), pavedGrid=indexGrid(24);
    for(const polygon of data.lots || []) lots.add(bounds(polygon[0]),polygon);
    function lotFor(x,z) {
      let matched=null,size=Infinity;
      for(const outline of lots.at(x,z)) {
        if(!inPolygon(x,z,outline)) continue;
        const lotSize=area(outline[0]);
        if(lotSize<size) { matched=outline; size=lotSize; }
      }
      return matched;
    }
    const largest=new Map(), lotHouses=new Map();
    for(const [, ,type,,poly] of data.houses) {
      if(type!==1) continue;
      const [x,z]=center(poly[0]),lot=lotFor(x,z);
      if(!lot) continue;
      const size=area(poly[0]);
      assigned.set(poly,lot);
      largest.set(lot,Math.max(size,largest.get(lot)||0));
      if(!lotHouses.has(lot)) lotHouses.set(lot,[]);
      lotHouses.get(lot).push({poly,x,z,size});
    }
    const lap=chunkedBatch(215),masonry=chunkedBatch(215),stucco=chunkedBatch(215),roof=chunkedBatch(235);
    const volume=chunkedBatch(190),trim=chunkedBatch(100),glazing=chunkedBatch(110);
    const concrete=chunkedBatch(120),gravel=chunkedBatch(120),beds=chunkedBatch(100);
    const plantings=[];
    const stone=new T.Color(0xb2a99a),paving=new T.Color(0xa9a19a),asphalt=new T.Color(0x69706e);
    const soil=new T.Color(0x554133),bricks=new T.Color(0xa67662);
    function paved(x,z) {
      return pavedGrid.at(x,z).some(([ax,az,bx,bz,width])=>segmentDistance(x,z,ax,az,bx,bz)<width*width);
    }
    function clearRoute(a,b,width,lot,outside=0) {
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(length<.12 || length>47) return false;
      for(let step=Math.min(.4,length*.15);step<length;step+=1.1) {
        const t=step/length,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
        if(inBuilding(x,z,width*.45) || onWater(x,z)) return false;
        if(lot && length-step>outside && !inPolygon(x,z,lot)) return false;
      }
      return true;
    }
    function ribbon(sink,a,b,width,color,lift=.064) {
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<.08) return;
      const rx=dz/length*width/2,rz=-dx/length*width/2;
      const steps=Math.ceil(length/1.65);
      const point=(t,side)=> {
        const x=a[0]+dx*t+rx*side,z=a[1]+dz*t+rz*side;
        return [x,ground(x,z)+lift,z];
      };
      for(let i=0;i<steps;i++) sink.quad(point(i/steps,1),point((i+1)/steps,1),
        point((i+1)/steps,-1),point(i/steps,-1),color,length/steps,width,0,i*length/steps);
      pavedGrid.add(bounds([a,b]),[...a,...b,width/2+.1],width/2+.15);
    }
    function entryYard(face,front,doorX,porchDepth,lot,rng) {
      const start=wallPoint(face,doorX,0,porchDepth+.65);
      const a=[start[0],start[2]];
      const target=sidewalkPoint(front.street,...a);
      const curb=front.street.width*.5+1.67;
      const b=[target.x+target.nx*curb,target.z+target.nz*curb];
      if(clearRoute(a,b,1.13,lot,3.8)) {
        ribbon(concrete,a,b,1.13,rng()<.25?bricks:paving);
      }
      if(!lot || front.gap<2.5 || rng()<.20) return;
      for(let side=-1;side<=1;side+=2) {
        const at=doorX+side*(1.22+rng()*.60);
        if(at<.7 || at>face.length-.7) continue;
        const p=wallPoint(face,at,0,.82+porchDepth*.28),x=p[0],z=p[2];
        if(!inPolygon(x,z,lot) || inBuilding(x,z,.19) || paved(x,z)) continue;
        const end=wallPoint(face,at+side*.53,0,1.11+porchDepth*.28);
        ribbon(beds,[x,z],[end[0],end[2]],1.09,soil,.049);
        plantings.push([x,z,.30+rng()*.39,rng()]);
      }
    }
    function driveway(face,front,lot,poly,rng) {
      if(!lot || rng()<.10) return;
      const owner=lotHouses.get(lot);
      const others=owner.filter(p=>p.poly!==poly && p.size<75 && p.size>=12);
      const options=rng()<.5?[-1.85,face.length+1.85]:[face.length+1.85,-1.85];
      for(const across of options) {
        const p=wallPoint(face,across,0,-2.8-rng()*3.1),a=[p[0],p[2]];
        if(!inPolygon(...a,lot)) continue;
        const road=sidewalkPoint(front.street,...a),curb=front.street.width*.5-.33;
        const b=[road.x+road.nx*curb,road.z+road.nz*curb];
        if(!clearRoute(a,b,2.62,lot,5.5) || paved(...a)) continue;
        const material=rng()<.62?gravel:concrete;
        const color=material===gravel?asphalt:paving;
        ribbon(material,a,b,2.62,color,.082);
        for(const garage of others) {
          const vx=garage.x-a[0],vz=garage.z-a[1],length=Math.hypot(vx,vz);
          if(length<2 || length>22) continue;
          const dx=vx/length,dz=vz/length;
          let extension=null;
          for(let distance=1;distance<length;distance+=.54) {
            const p=[a[0]+dx*distance,a[1]+dz*distance];
            if(inBuilding(...p,1.30)) break;
            extension=p;
          }
          if(extension && clearRoute(a,extension,2.53,lot)) {
            ribbon(material,a,extension,2.53,color,.081);
            break;
          }
        }
        return;
      }
    }

    function build(id,polygon,measured,estimated) {
      const ring=polygon[0],size=area(ring),lot=assigned.get(polygon);
      if(size<11 || size>305 || measured>14.4) return false;
      const winding=Math.sign(signedArea(ring))||1;
      const faces=ring.flatMap((a,i)=>{
        const b=ring[(i+1)%ring.length];
        return Math.hypot(b[0]-a[0],b[1]-a[1])<.24?[]:[edge(a,b,winding)];
      });
      if(!faces.length) return false;
      const rng=random((Number(id)||31)*97213);
      const longest=faces.reduce((a,b)=>a.length>b.length?a:b);
      let front=null,segment=null;
      for(const face of faces) {
        if(face.length<2.75) continue;
        const street=fitStreet(face,geo);
        if(!street) continue;
        const probe=wallPoint(face,face.length*.5,0,Math.min(2.3,street.gap*.7));
        if(inBuilding(probe[0],probe[2],.26)) continue;
        const rank=street.score-Math.min(face.length,10)*.36;
        if(!front || rank<front.rank) { front={...street,rank}; segment=face; }
      }
      const frame=segment||longest;
      const garage=lot && size<75 && (largest.get(lot)||0)>size*1.61;
      const single=garage || size<64 || size<153 && (measured>0?measured<5.6:rng()<.49);
      const levels=single?1:2;
      const form=garage?'gable':pick(['gable','gable','side','hip','gable'],rng);
      const [x,z]=center(ring),g=ground(x,z);
      const below=garage?.19:clamp(.42+rng()*.37+Math.abs(ground(...frame.a)-ground(...frame.b))*.11,.41,.91);
      const base=g+below;
      const rise=garage?1.3+rng()*.48:clamp(Math.sqrt(size)*(.17+rng()*.13),1.47,3.55);
      const floorHeight=garage?2.32:clamp((measured?measured-rise*.65:estimated-rise*.49)/levels,2.61,single?3.63:3.18);
      const top=base+floorHeight*levels;
      const shape=roofPlan(ring,frame,form,top,rise);
      const brickHouse=rng()<.20,stuccoHouse=!brickHouse&&rng()<.14;
      const facade=brickHouse?masonry:stuccoHouse?stucco:lap;
      const houseTint=new T.Color(pick(brickHouse?masonryColors:sidingColors,rng));
      const trimTint=new T.Color(rng()<.78?0xe4dccc:0xb1aa97);
      const roofTint=new T.Color(pick(roofColors,rng));
      const plinth=new T.Color(garage?0xa39e8f:0x938c81);
      const steel=new T.Color(0x655951);
      const recess=new T.Color(0x423f39);
      const white=new T.Color(0xf1e6d7);
      wallsFor(polygon,facade,volume,roof,shape,base,houseTint,plinth,trimTint,roofTint,ground);
      coverRoof(roof,polygon,shape,roofTint,triangulate);
      roofLevels.set(polygon,shape.high+.08);

      const doorWidth=garage?2.30:.93;
      const doorAt=frame.length*(garage?.50:rng()<.4?.31:rng()<.52?.69:.51);
      let porchDepth=0;
      if(front && frame.length>doorWidth+.6) {
        const threshold=base+.019;
        if(garage) {
          panel(trim,frame,doorAt,threshold,doorWidth,1.97,.028,trimTint);
          panel(trim,frame,doorAt,threshold+.09,doorWidth-.22,1.72,.037,new T.Color(0xa49b89));
          for(let course=1;course<=4;course++) panel(trim,frame,doorAt,threshold+course*.36,doorWidth-.22,.042,.043,recess);
        } else {
          panel(trim,frame,doorAt,threshold-.045,1.105,2.24,.038,trimTint);
          panel(glazing,frame,doorAt,threshold,.93,2.104,.050,new T.Color(pick(doorColors,rng)),5+Math.floor(rng()*3));
          porchDepth=front.gap>3.25 && frame.length>3.05 && rng()<.72?1.54+rng()*.47:.72;
          const wide=porchDepth>1?Math.min(frame.length*.44,2.42):.74;
          const left=Math.max(.12,doorAt-wide),right=Math.min(frame.length-.10,doorAt+wide);
          const soil=wallPoint(frame,doorAt,0,porchDepth+.35);
          const stepBase=Math.min(ground(soil[0],soil[2]),threshold-.11);
          const deckTint=new T.Color(porchDepth>1?0x9b8c79:0xb4aaa0);
          prism(trim,frame,left,right,.027,porchDepth,threshold-.21,threshold-.02,deckTint);
          const riseCount=Math.max(1,Math.min(6,Math.ceil((threshold-stepBase)/.19)));
          for(let j=0;j<riseCount;j++) {
            prism(trim,frame,doorAt-.61,doorAt+.61,porchDepth-.03,porchDepth+.29*(riseCount-j),
              stepBase-.02,stepBase+(threshold-stepBase)*(j+1)/(riseCount+1),stone);
          }
          if(porchDepth>1) {
            for(const col of [left+.10,right-.10]) prism(trim,frame,col-.062,col+.062,porchDepth-.16,porchDepth-.03,
              threshold-.01,threshold+2.26,trimTint);
            for(const [from,to] of [[left+.10,doorAt-.67],[doorAt+.67,right-.10]]) {
              if(to-from<.36) continue;
              prism(trim,frame,from,to,porchDepth-.14,porchDepth-.062,threshold+.79,threshold+.86,trimTint);
              for(let rail=from+.16;rail<to;rail+=.185) prism(trim,frame,rail-.019,rail+.019,porchDepth-.118,porchDepth-.081,
                threshold-.02,threshold+.79,trimTint);
            }
            const roofFront=porchDepth+.24,rearY=threshold+2.77,frontY=threshold+2.42;
            const a=wallPoint(frame,left-.13,rearY,.024),b=wallPoint(frame,right+.13,rearY,.024);
            const c=wallPoint(frame,right+.13,frontY,roofFront),d=wallPoint(frame,left-.13,frontY,roofFront);
            roof.quad(a,d,c,b,roofTint,porchDepth*.69,(right-left)*.59);
            prism(trim,frame,left-.13,right+.13,roofFront-.057,roofFront,frontY-.11,frontY,trimTint);
          }
          if(rng()<.34) panel(trim,frame,clamp(doorAt+.70,.35,frame.length-.35),threshold+1.43,.18,.29,.078,
            new T.Color(0xa88957));
          entryYard(frame,front,doorAt,porchDepth+Math.max(0,riseCount-2)*.29,lot,rng);
          driveway(frame,front,lot,polygon,rng);
        }
      }
      for(const face of faces) {
        if(face.length<1.44) continue;
        const isFront=face===frame&&Boolean(front);
        const count=garage?1:Math.max(1,Math.min(4,Math.round(face.length/(isFront?2.38:3.29))));
        const family=Math.floor(rng()*3);
        for(let story=0;story<levels;story++) {
          for(let bay=0;bay<count;bay++) {
            const at=face.length*(bay+.5)/count+(isFront?0:(rng()-.5)*.26);
            const width=Math.min(face.length/count-.31,garage?.76:family===2&&isFront&&story===0?1.62:.84+rng()*.24);
            const y=base+story*floorHeight+(garage?1.09:.81+rng()*.15),height=garage?.65:family===2?.98:1.24+rng()*.31;
            if(isFront && story===0 && Math.abs(at-doorAt)<doorWidth*.53+width/2+.12) continue;
            if(!isFront && !garage && rng()<.24) continue;
            if(width<.38) continue;
            panel(trim,face,at,y-.037,width+.13,height+.083,.044,trimTint);
            panel(glazing,face,at,y,width,height,.057,white,family);
            prism(trim,face,at-width*.59,at+width*.59,.016,.135,y-.083,y-.032,trimTint);
            if(isFront && family===0 && width<1.04 && rng()<.38) {
              const shutterTone=houseTint.clone().multiplyScalar(.62);
              for(const side of [-1,1]) panel(trim,face,at+side*(width*.5+.17),y+.03,.21,height-.06,.044,shutterTone);
            }
          }
        }
      }
      const attic=wallPoint(frame,frame.length*.5,0);
      const atticRise=shape.at(attic[0],attic[2])-top;
      if(!garage && atticRise>1.27 && frame.length>2.8 && rng()<.80) {
        panel(glazing,frame,frame.length*.5,top+.27,.61,Math.min(.83,atticRise-.34),.039,white,
          rng()<.48?3:4);
      }
      if(!garage && size>54 && rng()<.67 && inPolygon(x,z,polygon)) {
        const roofY=shape.at(x,z);
        const chimney={a:[x-.24,z],ux:1,uz:0,nx:0,nz:1};
        prism(volume,chimney,0,.52,-.19,.26,roofY-.53,roofY+.93,bricks);
        prism(volume,chimney,-.055,.574,-.24,.31,roofY+.88,roofY+1.02,steel);
        roofLevels.set(polygon,Math.max(shape.high+.08,roofY+1.02));
      }
      return true;
    }

    function complete() {
      const textured=map=>new T.MeshLambertMaterial({map,vertexColors:true,side:T.DoubleSide});
      const plain=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
      scene.add(lap.mesh(textured(surfaceTexture(0,random)),true),masonry.mesh(textured(surfaceTexture(1,random)),true),
        stucco.mesh(textured(surfaceTexture(3,random)),true),roof.mesh(textured(surfaceTexture(2,random)),true),
        volume.mesh(plain),trim.mesh(plain,false,390),glazing.mesh(joineryMaterial(evening),false,445),
        concrete.mesh(geo.pavingMaterial(true),false,780),gravel.mesh(geo.pavingMaterial(false),false,780),
        beds.mesh(plain,false,300));
    }
    return {build,complete,paved,plantings};
  }

  window.MadisonHomes={create};
})();
