(() => {
  'use strict';

  const T = THREE;
  const skies = [
    { top:0x3569af, haze:0xb3cbda, glow:0xffebc8, lit:0xfff4db, shade:0x667d9d,
      direction:[-.54,.64,.36], warmth:0xffedda, ambient:0xc4ddfa, bounce:0x7d7760, sun:2.35, fill:1.38,
      deep:0x144553, shallow:0x438b81, fog:0xc5d8dd, density:.00036, exposure:1.17 },
    { top:0x344d83, haze:0xd4aaa4, glow:0xffa158, lit:0xffcf9a, shade:0x6c637f,
      direction:[-.94,.205,-.35], warmth:0xffb36c, ambient:0xa5c1ee, bounce:0x987758, sun:2.85, fill:1.35,
      deep:0x183647, shallow:0x517b78, fog:0xd0aaa5, density:.00042, exposure:1.24 },
    { top:0x152f64, haze:0x877fa8, glow:0xff8392, lit:0xd2a3c4, shade:0x42537e,
      direction:[-.91,.082,-.42], warmth:0x9daeea, ambient:0xa4b6f0, bounce:0x6d5c75, sun:.84, fill:1.05,
      deep:0x192a4e, shallow:0x526687, fog:0x8583a4, density:.00042, exposure:1.13 }
  ];

  function cloudTexture() {
    const size=128, data=new Uint8Array(size*size*4);
    const hash=(x,z)=> {
      const value=Math.sin(x*93.16+z*57.57+2.2)*43758.5453;
      return value-Math.floor(value);
    };
    const mix=(a,b,t)=>a+(b-a)*t;
    function value(x,z,period) {
      const i=Math.floor(x),j=Math.floor(z);
      const a=x-i,b=z-j,u=a*a*(3-2*a),v=b*b*(3-2*b);
      const ni=(i+1)%period,nj=(j+1)%period;
      return mix(mix(hash(i,j),hash(ni,j),u),mix(hash(i,nj),hash(ni,nj),u),v);
    }
    for(let z=0;z<size;z++) {
      for(let x=0;x<size;x++) {
        const u=x/size,v=z/size,index=(z*size+x)*4;
        data[index]=255*(.6*value(u*8,v*8,8)+.27*value(u*17,v*17,17)+.13*value(u*31,v*31,31));
        data[index+1]=255*value(u*13,v*13,13);
        data[index+2]=255*hash(x,z);
        data[index+3]=255;
      }
    }
    const texture=new T.DataTexture(data,size,size,T.RGBAFormat);
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.magFilter=T.LinearFilter;
    texture.minFilter=T.LinearMipmapLinearFilter;
    texture.generateMipmaps=true;
    texture.needsUpdate=true;
    return texture;
  }

  function shoreTexture(polygons,bounds) {
    const [west,north,east,south]=bounds;
    const canvas=document.createElement('canvas');
    canvas.width=1024;
    canvas.height=640;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.beginPath();
    // Broader strokes establish shallow color. Narrower strokes guide the edge highlights.
    for(const polygon of polygons) {
      for(const ring of polygon) {
        ring.forEach(([x,z],i)=>ctx[i?'lineTo':'moveTo'](
          (x-west)/(east-west)*canvas.width,(z-north)/(south-north)*canvas.height));
        ctx.closePath();
      }
    }
    for(const [width,color] of [[13,'#222'],[7,'#626262'],[3,'#b2b2b2'],[1.2,'#fff']]) {
      ctx.lineWidth=width;
      ctx.strokeStyle=color;
      ctx.stroke();
    }
    return new T.CanvasTexture(canvas);
  }

  const airShader=`
    uniform sampler2D cloudMap;
    uniform vec3 skyTop, skyHaze, sunGlow, cloudLit, cloudShade, sun, sunlight;
    uniform float time, dusk;

    vec3 airColor(vec3 ray, float disc) {
      float h=max(0.,ray.y);
      float toward=max(0.,dot(ray,sun));
      float horizon=exp(-h*9.);
      vec3 color=mix(skyTop,skyHaze,horizon);
      color+=sunGlow*(pow(toward,7.)*.19+pow(toward,28.)*.26)*(.4+horizon);
      color+=sunGlow*(pow(toward,125.)*.19+pow(toward,500.)*.18);
      color+=disc*smoothstep(.99970,.99991,toward)*vec3(3.8,2.65,1.40)*(1.-.64*dusk);
      return color;
    }

    vec2 cloudDensity(vec2 uv) {
      float bend=texture2D(cloudMap,uv*.42+vec2(.33,.2)).g-.5;
      uv+=vec2(bend*.05,bend*.035);
      float packed=texture2D(cloudMap,uv).r;
      float detail=texture2D(cloudMap,uv*2.31+vec2(.37,.78)).r;
      float edge=texture2D(cloudMap,uv*6.23).r;
      return vec2(packed*.71+detail*.22+edge*.07,detail);
    }

    vec3 addClouds(vec3 color, vec3 ray, vec3 viewer) {
      float y=max(ray.y,.035);
      vec2 drift=vec2(time*.00012,-time*.000038);
      vec2 uv=(viewer.xz+ray.xz*(1230.-viewer.y)/y)*.000071+drift+vec2(.28,.71);
      uv.x*=.94;
      vec2 density=cloudDensity(uv);
      float body=smoothstep(.41,.61,density.x)*smoothstep(.025,.13,y);
      float sunEdge=cloudDensity(uv+sun.xz*.023).x;
      float edge=clamp(.5+(density.x-sunEdge)*4.5,0.,1.);
      float lower=clamp((density.x-.44)*2.7,0.,1.);
      vec3 cloud=mix(cloudShade*.78,cloudLit,edge*(.92-lower*.54)+.12);
      cloud+=sunGlow*.22*pow(max(0.,dot(ray,sun)),12.)*(1.-lower);
      color=mix(color,cloud,body*.88);
      float veil=texture2D(cloudMap,uv*.53+vec2(.22,.41)).r;
      float feather=smoothstep(.59,.75,veil)*smoothstep(.09,.28,y)*.18;
      return mix(color,cloudLit,feather*(1.-body));
    }
  `;

  function create(scene,water,bounds,polygons) {
    const air={
      cloudMap:{value:cloudTexture()}, sun:{value:new T.Vector3()},
      skyTop:{value:new T.Color()}, skyHaze:{value:new T.Color()}, sunGlow:{value:new T.Color()},
      cloudLit:{value:new T.Color()}, cloudShade:{value:new T.Color()}, sunlight:{value:new T.Color()},
      time:{value:0}, dusk:{value:0}
    };
    const dome=new T.Mesh(new T.SphereGeometry(7750,30,20),new T.ShaderMaterial({
      uniforms:air, side:T.BackSide, depthWrite:false,
      vertexShader:`
        varying vec3 direction;
        void main() {
          direction=position;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }
      `,
      fragmentShader:airShader+`
        varying vec3 direction;
        void main() {
          vec3 ray=normalize(direction);
          vec3 color=addClouds(airColor(ray,1.),ray,cameraPosition);
          float grain=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
          gl_FragColor=vec4(color+(grain-.5)*.002,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    }));
    dome.renderOrder=-20;
    scene.add(dome);

    const waves={...T.UniformsUtils.clone(T.UniformsLib.fog),...air,
      deep:{value:new T.Color()}, shallow:{value:new T.Color()},
      coast:{value:shoreTexture(polygons,bounds)}, extent:{value:new T.Vector4(...bounds)},
      mirrorMap:{value:null}, mirrorMatrix:{value:new T.Matrix4()}, mirrorMix:{value:0}
    };
    const surface=new T.ShaderMaterial({
      uniforms:waves, fog:true, side:T.DoubleSide,
      vertexShader:`
        uniform mat4 mirrorMatrix;
        varying vec4 mirrorPosition;
        varying vec3 surface;
        #include <fog_pars_vertex>
        void main() {
          surface=position;
          mirrorPosition=mirrorMatrix*vec4(position,1.);
          vec4 mvPosition=modelViewMatrix*vec4(position,1.);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader:airShader+`
        uniform sampler2D coast,mirrorMap;
        uniform vec4 extent;
        uniform vec3 deep,shallow;
        uniform float mirrorMix;
        varying vec4 mirrorPosition;
        varying vec3 surface;
        #include <fog_pars_fragment>
        void main() {
          vec2 p=surface.xz;
          vec3 eye=normalize(cameraPosition-surface);
          float viewDistance=distance(cameraPosition,surface);
          float fineFade=1.-smoothstep(160.,1150.,viewDistance);
          float rolling=sin(dot(p,vec2(.041,.054))-time*.74);
          float a=dot(p,vec2(.26,.48))+time*1.3+rolling*.82;
          float b=dot(p,vec2(-.34,.23))+time*.96+rolling*.33;
          float c=dot(p,vec2(.93,.76))-time*2.4+sin(p.y*.18);
          float d=dot(p,vec2(-1.27,.88))+time*2.1;
          vec2 tilt=.043*vec2(.47,.88)*cos(a)+.025*vec2(-.83,.56)*cos(b)
            +fineFade*(.019*vec2(.77,.63)*cos(c)+.013*vec2(-.83,.57)*cos(d));
          vec3 normal=normalize(vec3(tilt.x,1.,tilt.y));
          vec3 reflected=reflect(-eye,normal);
          vec3 reflection=airColor(reflected,0.);
          float softCloud=texture2D(cloudMap,
            (p+reflected.xz*(1230./max(.04,reflected.y)))*.000071+vec2(.28+time*.00012,.71)).r;
          reflection=mix(reflection,cloudLit,smoothstep(.48,.67,softCloud)*smoothstep(.025,.22,reflected.y)*.48);
          if(mirrorMix>.001) {
            vec2 hit=mirrorPosition.xy/max(.001,mirrorPosition.w)*.5+.5+tilt*.062;
            vec2 margin=min(hit,1.-hit);
            float valid=smoothstep(0.,.045,min(margin.x,margin.y))*step(.01,mirrorPosition.w);
            reflection=mix(reflection,texture2D(mirrorMap,hit).rgb,mirrorMix*valid*.62);
          }
          vec2 uv=(p-extent.xy)/(extent.zw-extent.xy);
          float valid=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
          float bank=texture2D(coast,vec2(uv.x,1.-uv.y)).r*valid;
          vec3 subsurface=mix(deep,shallow,smoothstep(.08,.88,bank)*.70);
          subsurface*=1.+(cos(a)*.032+sin(b)*.035+rolling*.052);
          float fresnel=.12+.83*pow(1.-clamp(dot(normal,eye),0.,1.),3.25);
          vec3 color=mix(subsurface,reflection,fresnel);
          vec3 halfDirection=normalize(eye+sun);
          float spec=max(0.,dot(halfDirection,normal));
          float shine=pow(spec,340.)*.77+pow(spec,94.)*.215+pow(spec,30.)*.04;
          color+=sunlight*shine*(1.09-.78*dusk);
          float shoreline=smoothstep(.46,.93,bank)*smoothstep(.78,.98,cos(b+rolling*1.8))*fineFade;
          color+=cloudLit*shoreline*.085;
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `
    });
    const lake=water.mesh(surface);
    scene.add(lake);

    const mirror=new T.PerspectiveCamera();
    const forward=new T.Vector3(), lookAt=new T.Vector3();
    const clip=[new T.Plane(new T.Vector3(0,1,0),-2.65)];
    let target, last=-Infinity, ready=false;
    function updateReflection(renderer,camera,seconds,enabled) {
      waves.mirrorMix.value=enabled&&ready?1:0;
      if(!enabled || seconds-last<.24) return;
      if(!target) {
        target=new T.WebGLRenderTarget(480,300,{depthBuffer:true});
        waves.mirrorMap.value=target.texture;
      }
      mirror.position.copy(camera.position);
      mirror.position.y=5.3-camera.position.y;
      camera.getWorldDirection(forward);
      forward.y*=-1;
      mirror.up.set(0,-1,0);
      mirror.lookAt(lookAt.copy(mirror.position).add(forward));
      mirror.projectionMatrix.copy(camera.projectionMatrix);
      mirror.updateMatrixWorld();
      waves.mirrorMatrix.value.multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse);
      const saved=renderer.getRenderTarget(), planes=renderer.clippingPlanes;
      const shadows=renderer.shadowMap.needsUpdate;
      try {
        lake.visible=false;
        renderer.shadowMap.needsUpdate=false;
        renderer.clippingPlanes=clip;
        renderer.setRenderTarget(target);
        dome.position.copy(mirror.position);
        renderer.render(scene,mirror);
        ready=true;
        waves.mirrorMix.value=1;
        last=seconds;
      } finally {
        renderer.setRenderTarget(saved);
        renderer.clippingPlanes=planes;
        renderer.shadowMap.needsUpdate=shadows;
        lake.visible=true;
        dome.position.copy(camera.position);
      }
    }

    return {
      setLight(index) {
        const mood=skies[index];
        const colors={skyTop:mood.top,skyHaze:mood.haze,sunGlow:mood.glow,cloudLit:mood.lit,
          cloudShade:mood.shade,sunlight:mood.glow,deep:mood.deep,shallow:mood.shallow};
        for(const [name,color] of Object.entries(colors)) waves[name].value.set(color);
        air.sun.value.set(...mood.direction).normalize();
        air.dusk.value=index===2?1:0;
        last=-Infinity;
        return {...mood,sunDirection:air.sun.value};
      },
      render(renderer,camera,seconds,reflections) {
        dome.position.copy(camera.position);
        air.time.value=seconds;
        updateReflection(renderer,camera,seconds,reflections);
      }
    };
  }

  window.MadisonAtmosphere={create};
})();
