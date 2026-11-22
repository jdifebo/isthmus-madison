(() => {
  'use strict';

  const T=THREE;

  function create(scene,geo) {
    const {data,ground,batch,fill,box,cylinder,mergeLandmark,roofLevels}=geo;
    const stand=data.houses.find(house=>house[1]==='Breese Stevens Field');
    const hasField=data.parks.some(([name])=>name==='Breese Stevens Athletic Field');
    if(!hasField || !stand) return null;
    const polygon=stand[4], center=[899,-967];
    const along=[.720,-.694], across=[.694,.720];
    const point=(u,v,lift=0)=>{
      const x=center[0]+along[0]*u+across[0]*v,z=center[1]+along[1]*u+across[1]*v;
      return [x,ground(x,z)+lift,z];
    };
    const field=batch(),markings=batch(),walls=batch(),trim=batch();
    const paint=new T.Color(0xe9e6cf);
    const grass=[new T.Color(0x52774a),new T.Color(0x5b804d)];
    const limestone=new T.Color(0xb8a487),cornice=new T.Color(0xcbb999);
    const gravel=new T.Color(0x6c6561),shadow=new T.Color(0x423e36),band=new T.Color(0x9e8a73);
    for(let u=-53;u<53;u+=5.3) {
      const shade=grass[Math.round((u+53)/5.3)%2];
      for(let v=-34;v<34;v+=3.4) {
        field.quad(point(u,v,.155),point(u,v+3.4,.155),point(u+5.3,v+3.4,.155),point(u+5.3,v,.155),shade);
      }
    }

    function line(a,b,width=.15) {
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const rx=(b[1]-a[1])/length*width*.5,rz=(a[0]-b[0])/length*width*.5;
      const slices=Math.max(1,Math.ceil(length/3.2));
      for(let i=0;i<slices;i++) {
        const p=(t,edge)=>point(a[0]+(b[0]-a[0])*t+rx*edge,a[1]+(b[1]-a[1])*t+rz*edge,.205);
        markings.quad(p(i/slices,-1),p((i+1)/slices,-1),p((i+1)/slices,1),p(i/slices,1),paint);
      }
    }
    function rectangle(left,right,bottom,top) {
      line([left,bottom],[right,bottom]);
      line([right,bottom],[right,top]);
      line([right,top],[left,top]);
      line([left,top],[left,bottom]);
    }
    function ring(u,v,r,start=0,end=Math.PI*2) {
      for(let i=0;i<40;i++) {
        const a=start+(end-start)*i/40,b=start+(end-start)*(i+1)/40;
        line([u+Math.cos(a)*r,v+Math.sin(a)*r],[u+Math.cos(b)*r,v+Math.sin(b)*r]);
      }
    }
    rectangle(-50,50,-31.4,31.4);
    line([0,-31.4],[0,31.4]);
    ring(0,0,9.15);
    for(const [u,v] of [[0,0],[-39,0],[39,0]]) ring(u,v,.115);
    rectangle(-50,-33.5,-20.08,20.08);
    rectangle(33.5,50,-20.08,20.08);
    rectangle(-50,-44.5,-9.16,9.16);
    rectangle(44.5,50,-9.16,9.16);
    ring(-39,0,9.15,-.92,.92);
    ring(39,0,9.15,Math.PI-.92,Math.PI+.92);

    const standY=ground(841,-942)+6.15;
    fill(walls,polygon,()=>standY,gravel);
    for(const outline of polygon) {
      for(let i=0;i<outline.length;i++) {
        const [a,b]=[outline[i],outline[(i+1)%outline.length]];
        const [ax,az]=a,[bx,bz]=b,length=Math.hypot(bx-ax,bz-az);
        if(length<.06) continue;
        const nx=(bz-az)/length,nz=-(bx-ax)/length;
        const at=(t,y,lift=0)=>[ax+(bx-ax)*t+nx*lift,y,az+(bz-az)*t+nz*lift];
        walls.quad(at(0,ground(ax,az)-.5),at(1,ground(bx,bz)-.5),at(1,standY),at(0,standY),limestone);
        for(const side of [-1,1]) {
          trim.quad(at(0,standY-.24,side*.023),at(1,standY-.24,side*.023),
            at(1,standY+.09,side*.023),at(0,standY+.09,side*.023),cornice);
        }
        if(length<9) continue;
        const bays=Math.floor(length/4.33),span=length/bays;
        for(let bay=0;bay<bays;bay++) {
          const s=(bay+.5)*span,t=s/length,base=ground(ax+(bx-ax)*t,az+(bz-az)*t)+.19;
          const head=Math.min(standY-.50,base+2.23),r=.83;
          if(head-base<1.2) continue;
          for(const side of [-1,1]) {
            const offset=side*.046;
            trim.quad(at((s-r)/length,base,offset),at((s+r)/length,base,offset),
              at((s+r)/length,head,offset),at((s-r)/length,head,offset),shadow);
            const entrance=at(t,head,offset);
            for(let k=0;k<11;k++) {
              const left=k*Math.PI/11,right=(k+1)*Math.PI/11;
              const arch=(angle,size,lift)=>at((s+Math.cos(angle)*size)/length,head+Math.sin(angle)*size*.72,lift);
              trim.triangle(entrance,arch(left,r,offset),arch(right,r,offset),shadow);
              trim.quad(arch(left,r,offset+side*.012),arch(right,r,offset+side*.012),
                arch(right,r+.16,offset+side*.014),arch(left,r+.16,offset+side*.014),band);
            }
          }
        }
      }
    }
    roofLevels.set(polygon,standY+.13);
    const base=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
    const pitch=field.mesh(base);
    pitch.receiveShadow=true;
    const grandstand=walls.mesh(base);
    grandstand.castShadow=grandstand.receiveShadow=true;
    scene.add(pitch,markings.mesh(base),grandstand,trim.mesh(base));

    const structures=new T.Group();
    const seats=new T.MeshLambertMaterial({color:0x718890});
    const posts=new T.MeshLambertMaterial({color:0xacaea5});
    const white=new T.MeshLambertMaterial({color:0xf1ecda});
    const railing=new T.MeshLambertMaterial({color:0x565956});
    const flood=new T.MeshLambertMaterial({color:0xe9dec1,emissive:0xfff0c0,emissiveIntensity:.09});
    const heading=Math.atan2(along[0],along[1]);
    function block(u,v,height,w,h,d,material) {
      const [x,y,z]=point(u,v,height);
      return box(structures,w,h,d,x,y,z,material);
    }
    for(const sign of [-1,1]) {
      for(let row=0;row<6;row++) {
        const v=sign*(36.1+row*.72),y=.25+row*.283;
        for(const u of [-30.5,0,30.5]) {
          block(u,v,y,.41,.17,27.8,seats).rotation.y=heading;
          block(u,v,y-.237,.58,.28,27.8,railing).rotation.y=heading;
        }
      }
      for(const u of [-46,-23,0,23,46]) {
        block(u,sign*40.3,.92,.10,1.67,.10,posts);
      }
      block(0,sign*40.35,1.39,.075,.072,92.5,posts).rotation.y=heading;
      for(const v of [-3.66,3.66]) {
        block(sign*50.16,v,1.36,.09,2.47,.10,white);
        block(sign*50.82,v,.27,.09,.12,1.32,white).rotation.y=heading;
      }
      block(sign*50.16,0,2.61,7.41,.10,.11,white).rotation.y=heading;
      for(const v of [-39.5,39.5]) {
        const [x,y,z]=point(sign*46.8,v);
        cylinder(structures,.099,.19,16,x,y+8,z,posts,10);
        for(let lamp=0;lamp<4;lamp++) {
          const light=block(sign*46.8+lamp*.31-.47,v,16.1,.31,.24,.32,flood);
          light.rotation.set(sign*.18,heading+Math.PI/2,0);
        }
      }
    }
    mergeLandmark(structures);
    scene.add(structures);
    return evening=>{ flood.emissiveIntensity=.09+evening*.95; };
  }

  window.MadisonPlaces={create};
})();
