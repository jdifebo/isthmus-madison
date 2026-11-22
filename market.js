(() => {
  'use strict';

  const T=THREE;
  const square=[[-167.5,1.3],[-3.4,163.5],[160.5,.8],[-.8,-166.3]];
  const closures=[
    [[-320,-8.3],[-187,-5.3]],
    [[-167.2,6.2],[-92.8,84.2]],
    [[-170.2,-12.7],[-89,-89.8]]
  ];
  const stalls=[
    {name:'Orchard Apples',items:[['Honeycrisp','Crisp and tart-sweet'],['Pears','Soft and fragrant when ripe'],['Pressed cider','A blend of orchard apples']],cloth:[0xa84436,0xf0ddbb]},
    {name:'Farmstead Cheese',items:[['Aged cheddar','A sharp Wisconsin classic'],['Cheese curds','Fresh and squeaky'],['Caraway jack','A mellow cheese with toasted caraway']],cloth:[0xd39a3b,0xf8e2b9]},
    {name:'Cut Flowers',items:[['Sunflowers','Tall stems with golden faces'],['Zinnias','A bunch of bright summer colors'],['Market bouquet','Seasonal flowers wrapped in paper']],cloth:[0x647d69,0xf7ebd7]},
    {name:'Country Bread',items:[['Country sourdough','A dark crust and open crumb'],['Rye loaf','Earthy rye with caraway'],['Seeded rolls','Small rolls with a toasted crust']],cloth:[0x567388,0xd9e5de]},
    {name:'Tomatoes & Peppers',items:[['Heirloom tomatoes','Mixed colors and shapes'],['Sweet peppers','Crisp red and yellow peppers'],['Cherry tomatoes','A small basket for snacking']],cloth:[0xbb6246,0xf4d4a5]},
    {name:'Squash & Roots',items:[['Winter squash','A mix of small roasting squash'],['Carrots','A bunch with the greens on'],['Beets','Earthy roots with deep red color']],cloth:[0x866365,0xf1dcc5]},
    {name:'Honey & Preserves',items:[['Wildflower honey','Amber honey from summer blooms'],['Berry jam','Small-batch berry preserves'],['Apple butter','Slow-cooked apples and warm spices']],cloth:[0x527d79,0xeee5d0]},
    {name:'Greens & Herbs',items:[['Rainbow chard','Leaves with colorful ribs'],['Basil','A fragrant bunch for the kitchen'],['Salad greens','A mix of tender leaves']],cloth:[0x6d854d,0xe3e5c8]}
  ];

  function edges(points) {
    return points.map(([x,z],i)=>{
      const [ex,ez]=points[(i+1)%points.length],length=Math.hypot(ex-x,ez-z),dx=(ex-x)/length,dz=(ez-z)/length;
      return {x,z,dx,dz,nx:dz,nz:-dx,length};
    });
  }

  function promenade() {
    const route=edges(square.map(([x,z])=>[x*.87,z*.87]));
    const length=route.reduce((sum,edge)=>sum+edge.length,0);
    function cornerNormal(a,b) {
      const scale=1/(1+a.nx*b.nx+a.nz*b.nz);
      return [(a.nx+b.nx)*scale,(a.nz+b.nz)*scale];
    }
    for(const [i,edge] of route.entries()) {
      edge.entry=cornerNormal(route.at(i-1),edge);
      edge.exit=cornerNormal(edge,route[(i+1)%route.length]);
    }
    function offset(edge,along,lateral) {
      const [nx,nz]=along<edge.length/2?edge.entry:edge.exit;
      const blend=Math.max(0,1-Math.min(along,edge.length-along)/9);
      return [edge.x+edge.dx*along+lateral*(edge.nx+(nx-edge.nx)*blend),
        edge.z+edge.dz*along+lateral*(edge.nz+(nz-edge.nz)*blend)];
    }
    function sample(distance,lateral=0) {
      let at=((distance%length)+length)%length;
      for(const edge of route) {
        if(at<edge.length) return offset(edge,at,lateral);
        at-=edge.length;
      }
      return [route[0].x,route[0].z];
    }
    return {route,length,sample,offset};
  }

  function signMaterial(name) {
    const canvas=document.createElement('canvas');
    canvas.width=576; canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#efe4c8'; ctx.fillRect(0,0,576,128);
    ctx.strokeStyle='#735946'; ctx.lineWidth=4; ctx.strokeRect(7,7,562,114);
    ctx.textAlign='center'; ctx.fillStyle='#402e29';
    ctx.font='bold 52px Georgia'; ctx.fillText(name,288,68,526);
    ctx.font='bold 23px sans-serif'; ctx.fillText('WISCONSIN GROWN',288,102);
    const map=new T.CanvasTexture(canvas);
    map.colorSpace=T.SRGBColorSpace;
    return new T.MeshLambertMaterial({map});
  }

  function create(scene,geo) {
    const {ground,box,cylinder,inBuilding,onWater,random,mergeLandmark,batch,segmentDistance}=geo;
    const rng=random(680127),loop=promenade(),locations=[];
    const labels=stalls.map(({name})=>signMaterial(name));
    const coat=color=>new T.MeshLambertMaterial({color});
    const wood=coat(0x976d48),slat=coat(0xb48857),paper=coat(0xe7d9b9),steel=coat(0x929a94),linen=coat(0xb6aca0);
    const colors=[0xb54c37,0xc69647,0x7d903d,0xf1b844,0xd06f33,0x5f793d,0xbe7452,0x936556,
      0x712d3c,0xe2a64b,0xbc8855,0x6b9255,0xd59a91,0xd8b8c3,0xaf6f9c].map(coat);
    const ball=new T.SphereGeometry(1,8,5);
    const walkway=batch(),pathColor=new T.Color(0xbcb29e),stallPaving=new T.Color(0xa99a84);
    const canopies=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
    const walkBand=2.48,vendorBand=7.86;
    for(const edge of loop.route) {
      const vertex=(along,lateral)=>{
        const [x,z]=loop.offset(edge,along,lateral);
        return [x,ground(x,z)+.114,z];
      };
      for(let s=0;s<edge.length;s+=3) {
        const end=Math.min(edge.length,s+3);
        walkway.quad(vertex(s,walkBand),vertex(end,walkBand),vertex(end,-walkBand),vertex(s,-walkBand),pathColor,3,walkBand*2,0,s);
        walkway.quad(vertex(s,-walkBand),vertex(end,-walkBand),vertex(end,-vendorBand),vertex(s,-vendorBand),stallPaving,3,vendorBand-walkBand,0,s);
      }
    }
    const aisle=walkway.mesh(geo.pavingMaterial(true,true));
    aisle.receiveShadow=true;
    scene.add(aisle);

    function oval(parent,x,y,z,rx,ry,rz,color) {
      const mesh=new T.Mesh(ball,color);
      mesh.position.set(x,y,z);
      mesh.scale.set(rx,ry,rz);
      mesh.rotation.y=rng()*Math.PI;
      parent.add(mesh);
    }

    function goods(group,style) {
      for(const bin of [-.91,0,.91]) {
        box(group,.81,.108,.55,bin,1.02,.83,slat);
        for(const side of [-1,1]) {
          box(group,.81,.074,.034,bin,1.10,.83+side*.26,wood);
          box(group,.032,.085,.54,bin+side*.40,1.10,.83,wood);
        }
        for(let item=0;item<8;item++) {
          const x=bin+((item%4)-1.5)*.175+(rng()-.5)*.037;
          const z=.69+Math.floor(item/4)*.23+(rng()-.5)*.034;
          const size=.047+rng()*.022;
          if(style===2) {
            const tall=.22+rng()*.23;
            box(group,.013,tall,.014,x,1.073+tall*.5,z,colors[5]);
            const bloom=colors[[3,12,13,14][item%4]];
            for(let petal=0;petal<5;petal++) {
              const a=petal*Math.PI*.4;
              oval(group,x+Math.cos(a)*.039,1.079+tall,z+Math.sin(a)*.039,.037,.018,.035,bloom);
            }
            oval(group,x,1.092+tall,z,.028,.023,.026,colors[9]);
          } else if(style===6) {
            const fill=colors[item%3===0?8:9];
            cylinder(group,.051,.051,.12,x,1.133,z,fill,9);
            cylinder(group,.057,.057,.024,x,1.204,z,paper,9);
            box(group,.061,.041,.017,x,1.126,z+.048,linen);
          } else if(style===1) {
            const wedge=cylinder(group,.092,.092,.067,x,1.122,z,colors[item%3===0?1:3],3);
            wedge.rotation.y=item*.74;
            box(group,.069,.013,.052,x,1.160,z,paper);
          } else if(style===3) {
            oval(group,x,1.129,z,.074,.063,.095,colors[item%3===0?7:10]);
            box(group,.055,.012,.018,x,1.187,z,paper).rotation.y=.45;
          } else if(style===7) {
            for(let leaf=0;leaf<4;leaf++) {
              oval(group,x+(rng()-.5)*.12,1.115+rng()*.047,z+(rng()-.5)*.10,.037,.062,.093,colors[leaf%2===0?5:11]);
            }
          } else {
            const fill=colors[style===0?[0,1,2][item%3]:style===4?[0,0,3][item%3]:[2,4,8][item%3]];
            oval(group,x,1.08+size,z,size,style===5?size*.73:size,size*.92,fill);
            box(group,.014,.017,.014,x,1.085+size*1.74,z,colors[5]);
          }
        }
      }
    }

    function tent(group,style) {
      const roof=batch(),palette=stalls[style].cloth.map(color=>new T.Color(color));
      const width=3.42,back=-1.48,front=1.44,eave=2.26,ridge=3.01;
      for(let panel=0;panel<8;panel++) {
        const left=(panel/8-.5)*width,right=left+width/8;
        const color=palette[panel%2],seam=color.clone().multiplyScalar(.83);
        for(const side of [back,front]) {
          roof.quad([left,eave,side],[right,eave,side],[right,ridge,0],[left,ridge,0],color);
          roof.quad([left,eave,side],[right,eave,side],[right,eave-.183,side],[left,eave-.183,side],color);
          roof.quad([left,eave-.183,side],[right,eave-.183,side],[right,eave-.202,side],[left,eave-.202,side],seam);
        }
      }
      for(const side of [-1,1]) roof.triangle([side*width/2,eave,back],[side*width/2,eave,front],[side*width/2,ridge,0],palette[0]);
      group.add(roof.mesh(canopies));
      for(const edge of [-1,1]) for(const row of [-1,1]) {
        box(group,.060,2.30,.060,edge*1.60,1.15,row*1.34,steel);
        box(group,.14,.045,.16,edge*1.60,.042,row*1.34,wood);
      }
      box(group,2.77,.097,.78,0,.958,.77,wood);
      box(group,2.50,.67,.056,0,.581,.975,linen);
      for(const side of [-1,1]) {
        box(group,.094,.91,.10,side*1.23,.472,.492,wood);
        box(group,.85,.41,.55,side*.87,.24,-.91,slat);
        for(const height of [.125,.247,.366]) box(group,.85,.026,.034,side*.87,height,-.622,wood);
      }
      goods(group,style);
    }

    const signGeometry=new T.PlaneGeometry(2.41,.53);
    for(const [index,edge] of edges(square).entries()) {
      const batchGroup=new T.Group();
      const spacing=index===0?8.85:12.45;
      for(let along=21.7;along<edge.length-18;along+=spacing) {
        if(Math.abs(along-edge.length*.51)<7.9) continue;
        const x=edge.x+edge.dx*along+edge.nx*9.35,z=edge.z+edge.dz*along+edge.nz*9.35;
        if(inBuilding(x,z,2.4) || onWater(x,z)) continue;
        const style=(locations.length+Math.floor(index*.5))%stalls.length;
        const yaw=Math.atan2(edge.nx,edge.nz);
        const group=new T.Group();
        group.position.set(x,ground(x,z)+.105,z);
        group.rotation.y=yaw;
        batchGroup.add(group);
        tent(group,style);
        const sign=new T.Mesh(signGeometry,labels[style]);
        sign.position.set(x+edge.nx*1.461,group.position.y+2.03,z+edge.nz*1.461);
        sign.rotation.y=yaw;
        scene.add(sign);
        locations.push({...stalls[style],x,z,nx:edge.nx,nz:edge.nz,dx:edge.dx,dz:edge.dz});
      }
      mergeLandmark(batchGroup);
      for(const mesh of batchGroup.children) { mesh.castShadow=true; mesh.receiveShadow=true; }
      scene.add(batchGroup);
    }

    const barrier=new T.Group(),white=coat(0xd6ccb9),orange=coat(0xe37839);
    for(const [a,b] of closures) {
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      const rx=dz/length,rz=-dx/length;
      for(const [px,pz] of [a,b]) {
        const gate=new T.Group();
        gate.position.set(px,ground(px,pz)+.22,pz);
        gate.rotation.y=Math.atan2(-rz,rx);
        for(const side of [-1,1]) box(gate,.105,.99,.16,side*2.55,.49,0,white);
        box(gate,5.8,.19,.102,0,.79,0,white);
        for(let stripe=-2.65;stripe<2.8;stripe+=.55) {
          const panel=box(gate,.23,.17,.109,stripe,.79,0,orange);
          panel.rotation.z=.27;
        }
        barrier.add(gate);
      }
    }
    mergeLandmark(barrier);
    scene.add(barrier);

    function paved(x,z) {
      const inside=loop.route.every(edge=>(x-edge.x)*edge.nx+(z-edge.z)*edge.nz>-vendorBand);
      return inside && loop.route.some(edge=>(x-edge.x)*edge.nx+(z-edge.z)*edge.nz<walkBand);
    }
    function blocked(x,z,radius) {
      return locations.some(s=>{
        if(Math.abs(x-s.x)>3.5 || Math.abs(z-s.z)>3.5) return false;
        const px=x-s.x,pz=z-s.z,along=px*s.dx+pz*s.dz,across=px*s.nx+pz*s.nz;
        return Math.abs(along)<1.41+radius && across>-.99-radius && across<1.05+radius;
      });
    }
    function drivingBlocked(x,z,radius) {
      return closures.some(([a,b])=>segmentDistance(x,z,...a,...b)<(4.35+radius)**2);
    }
    function nearby(x,z) {
      let best=4.16,found;
      for(const item of locations) {
        const px=x-item.x,pz=z-item.z;
        if(px*item.nx+pz*item.nz<1.15) continue;
        const distance=Math.hypot(px-item.nx*1.39,pz-item.nz*1.39);
        if(distance<best) { best=distance; found=item; }
      }
      return found;
    }
    const first=locations[0];
    const start={name:'Saturday Market',x:first.x+first.nx*3.77-first.dx*3.05,z:first.z+first.nz*3.77-first.dz*3.05,
      yaw:Math.atan2(first.dx-first.nx*.36,-first.dz+first.nz*.36),pitch:-.019,above:78};
    return {loop,start,locations,paved,blocked,drivingBlocked,nearby};
  }

  window.MadisonMarket={create};
})();
