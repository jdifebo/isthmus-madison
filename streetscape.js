(() => {
  'use strict';

  const T=THREE;

  function busLettering(scene,stencils,ground) {
    if(!stencils.length) return;
    const canvas=document.createElement('canvas');
    canvas.width=128;
    canvas.height=256;
    const ink=canvas.getContext('2d');
    ink.fillStyle='#f5eddd';
    ink.textAlign='center';
    ink.textBaseline='middle';
    ink.font='900 59px sans-serif';
    ink.fillText('ONLY',64,64,116);
    ink.fillText('BUS',64,179,107);
    const texture=new T.CanvasTexture(canvas);
    texture.colorSpace=T.SRGBColorSpace;
    const material=new T.MeshLambertMaterial({map:texture,alphaTest:.3,side:T.DoubleSide});
    material.polygonOffset=true;
    material.polygonOffsetFactor=-2;
    const letters=new T.InstancedMesh(new T.PlaneGeometry(2.42,6.1),material,stencils.length);
    const transform=new T.Object3D();
    const matrix=new T.Matrix4(), normal=new T.Vector3(0,1,0);
    const localX=new T.Vector3(), localY=new T.Vector3();
    stencils.forEach(([x,z,dx,dz],index)=>{
      localX.set(-dz,0,dx);
      localY.set(dx,0,dz);
      matrix.makeBasis(localX,localY,normal);
      transform.quaternion.setFromRotationMatrix(matrix);
      transform.position.set(x,ground(x,z)+.33,z);
      transform.updateMatrix();
      letters.setMatrixAt(index,transform.matrix);
    });
    scene.add(letters);
  }

  function stationSign(name) {
    const canvas=document.createElement('canvas');
    canvas.width=256;
    canvas.height=128;
    const ink=canvas.getContext('2d');
    ink.fillStyle='#182b3d';
    ink.fillRect(0,0,256,128);
    ink.fillStyle='#4cbdcf';
    ink.fillRect(0,0,256,9);
    ink.font='700 28px sans-serif';
    ink.fillText('METRO RAPID',14,44,229);
    ink.fillStyle='#f4f6ef';
    ink.font='700 41px sans-serif';
    ink.fillText(name,14,89,226);
    ink.font='600 15px sans-serif';
    ink.fillText('EAST WASHINGTON AVENUE',15,114);
    const map=new T.CanvasTexture(canvas);
    map.colorSpace=T.SRGBColorSpace;
    map.anisotropy=5;
    return new T.MeshLambertMaterial({map});
  }

  function stations(scene,layout,geo) {
    const {ground,box,mergeLandmark}=geo;
    const stone=new T.MeshLambertMaterial({color:0xc2beb3});
    const charcoal=new T.MeshLambertMaterial({color:0x303a3e});
    const timber=new T.MeshLambertMaterial({color:0x886847});
    const steel=new T.MeshLambertMaterial({color:0x79858b});
    const glass=new T.MeshLambertMaterial({color:0x95bac4,transparent:true,opacity:.40,side:T.DoubleSide,depthWrite:false});
    const tactile=new T.MeshLambertMaterial({color:0xaa4b37});
    const stripe=new T.MeshLambertMaterial({color:0xe6b950});
    const lamp=new T.MeshLambertMaterial({color:0xf2e8ce,emissive:0xf9bf8e,emissiveIntensity:.16});
    for(const [name,x,z,dx,dz] of layout) {
      const station=new T.Group();
      station.position.set(x,ground(x,z)+.10,z);
      const grade=ground(x+dx*9,z+dz*9)-ground(x-dx*9,z-dz*9);
      station.rotation.set(-Math.atan2(grade,18),Math.atan2(dx,dz),0,'YXZ');
      scene.add(station);
      const structures=new T.Group();
      station.add(structures);
      // The center island is long enough for an articulated bus, with ramps at both ends.
      box(structures,4.35,.32,21.2,0,.18,0,stone);
      for(const side of [-1,1]) {
        box(structures,.36,.045,20.9,side*1.79,.36,0,tactile);
        box(structures,.148,.035,20.95,side*2.11,.357,0,stripe);
        const ramp=box(structures,3.83,.12,3.75,0,.155,side*12.4,stone);
        ramp.rotation.x=side*.079;
        box(structures,.045,.04,10.8,side*1.99,3.34,-1.12,steel);
        for(const p of [-5.1,-1.4,2.3]) {
          box(structures,.14,2.82,.14,side*1.24,1.74,p,charcoal);
        }
        for(const railZ of [7.75,10.5]) {
          box(structures,.095,.83,.08,side*1.78,.73,railZ,steel);
        }
        box(structures,.045,.055,2.82,side*1.78,1.12,9.13,steel);
      }
      box(structures,3.6,.18,12.25,0,3.24,-1.42,charcoal);
      box(structures,3.34,.06,11.9,0,3.12,-1.42,timber);
      box(structures,2.47,2.65,.14,0,1.79,-7.05,timber);
      box(structures,.8,.12,4.2,0,.78,-2.49,timber);
      for(const benchZ of [-3.85,-1.16]) box(structures,.56,.39,.11,0,.55,benchZ,charcoal);
      box(structures,.45,1.5,.52,.52,1.10,3.17,charcoal);
      box(structures,.21,.11,7.7,0,3.01,-1.45,lamp);
      box(structures,.22,2.59,1.08,-.88,1.56,7.05,charcoal);
      mergeLandmark(structures);
      for(const side of [-1,1]) {
        box(station,.035,1.93,3.18,side*1.26,1.62,-3.25,glass);
        const tag=new T.Mesh(new T.PlaneGeometry(1.62,.81),stationSign(name));
        tag.rotation.y=side*Math.PI/2;
        tag.position.set(side*.27-.88,2.31,7.03);
        station.add(tag);
      }
    }
    return amount=>{ lamp.emissiveIntensity=.16+amount*.89; };
  }

  function trafficSignals(scene,layout,geo,clock) {
    const {box,cylinder,ground,mergeLandmark}=geo;
    const {cycle,green,yellow}=MadisonTraffic;
    const post=new T.MeshLambertMaterial({color:0x7b8381});
    const metal=new T.MeshLambertMaterial({color:0x313735});
    const backs=new T.MeshLambertMaterial({color:0x68604a});
    const chunks=new Map(), lenses=[];
    for(const {x,z,axes,phase} of layout) {
      const key=Math.floor(x/330)+','+Math.floor(z/330);
      if(!chunks.has(key)) chunks.set(key,new T.Group());
      const chunk=chunks.get(key);
      for(let axis=0;axis<2;axis++) {
        const main=axes[axis], side=axes[1-axis];
        const {dx,dz,extent}=main;
        const forward=side.extent+2.0;
        for(const sign of [-1,1]) {
          const ux=dx*sign,uz=dz*sign,rx=-uz,rz=ux;
          const offset=extent+1.22;
          const px=x+ux*forward+rx*offset,pz=z+uz*forward+rz*offset;
          const base=ground(px,pz), top=base+5.58;
          const arm=Math.min(11.8,extent*.74+1.42);
          cylinder(chunk,.104,.145,5.6,px,base+2.8,pz,post,8);
          cylinder(chunk,.205,.29,.22,px,base+.19,pz,post,8);
          box(chunk,.13,.122,arm,px-rx*arm*.5,top,pz-rz*arm*.5,post).rotation.y=Math.atan2(rx,rz);
          const hx=px-rx*(arm-.34),hz=pz-rz*(arm-.34);
          box(chunk,.38,1.11,.21,hx,top-.46,hz,backs).rotation.y=Math.atan2(ux,uz);
          box(chunk,.35,1.08,.08,hx+ux*.095,top-.46,hz+uz*.095,metal).rotation.y=Math.atan2(ux,uz);
          for(let signal=0;signal<3;signal++) {
            const y=top-.14-signal*.315;
            const visor=box(chunk,.259,.043,.25,hx+ux*.176,y+.13,hz+uz*.176,metal);
            visor.rotation.y=Math.atan2(ux,uz);
            lenses.push([hx+ux*.155,y,hz+uz*.155,ux,uz,phase,axis,signal]);
          }
        }
      }
    }
    for(const chunk of chunks.values()) {
      mergeLandmark(chunk);
      for(const mesh of chunk.children) {
        mesh.geometry.computeBoundingSphere();
        mesh.userData.range=665;
        mesh.castShadow=false;
      }
      scene.add(chunk);
    }
    if(!lenses.length) return;
    const meta=new Float32Array(lenses.length*3);
    const lens=new T.SphereGeometry(.105,9,5);
    const material=new T.MeshBasicMaterial();
    const colors=new T.InstancedMesh(lens,material,lenses.length);
    const dummy=new T.Object3D();
    lenses.forEach(([x,y,z,dx,dz,time,axis,index],i)=>{
      meta.set([time,axis,index],i*3);
      dummy.position.set(x,y,z);
      dummy.rotation.y=Math.atan2(dx,dz);
      dummy.scale.set(1,1,.43);
      dummy.updateMatrix();
      colors.setMatrixAt(i,dummy.matrix);
    });
    lens.setAttribute('signalInfo',new T.InstancedBufferAttribute(meta,3));
    material.onBeforeCompile=shader=>{
      shader.uniforms.signalClock=clock;
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`
        #include <common>
        attribute vec3 signalInfo;
        varying vec3 phaseInfo;
      `).replace('#include <begin_vertex>','#include <begin_vertex>\nphaseInfo=signalInfo;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`
        #include <common>
        uniform float signalClock;
        varying vec3 phaseInfo;
      `).replace('#include <color_fragment>',`
        #include <color_fragment>
        float phase=mod(signalClock+phaseInfo.x+phaseInfo.y*${(cycle/2).toFixed(1)},${cycle.toFixed(1)});
        float litLens=phase<${green.toFixed(1)}?2.:phase<${yellow.toFixed(1)}?1.:0.;
        vec3 lampColor=phaseInfo.z<.5?vec3(1.,.026,.012):
          phaseInfo.z<1.5?vec3(1.,.48,.018):vec3(.027,.91,.247);
        float power=abs(litLens-phaseInfo.z)<.20?1.68:.034;
        diffuseColor.rgb=lampColor*power+vec3(.015);
      `);
    };
    scene.add(colors);
  }

  function create(scene,{stencils,stops,signals},geo,clock) {
    busLettering(scene,stencils,geo.ground);
    trafficSignals(scene,signals,geo,clock);
    return stations(scene,stops,geo);
  }

  window.MadisonStreetscape={create};
})();
