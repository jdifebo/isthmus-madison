(() => {
  'use strict';

  const melody=[52,59,64,55,57,64,67,59,55,62,67,62,50,57,62,57];
  const rate=.285;
  const hz=n=>440*2**((n-69)/12);

  function create() {
    let context,volume,active=false,beat=-1,beep=-1,lastCoach=0;
    async function toggle() {
      try {
        if(active) {
          active=false;
          volume.gain.setTargetAtTime(0,context.currentTime,.035);
          return false;
        }
        if(!context) {
          const Audio=window.AudioContext || window.webkitAudioContext;
          if(!Audio) return false;
          context=new Audio();
          volume=context.createGain();
          volume.gain.value=0;
          volume.connect(context.destination);
        }
        await context.resume();
        active=context.state==='running';
        if(active) volume.gain.setTargetAtTime(.52,context.currentTime,.065);
      } catch { active=false; }
      return active;
    }

    function note(frequency,duration,gain,pan,type='sine') {
      const now=context.currentTime,oscillator=context.createOscillator(),pulse=context.createGain();
      oscillator.type=type;
      oscillator.frequency.value=frequency;
      pulse.gain.setValueAtTime(.0001,now);
      pulse.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),now+.017);
      pulse.gain.exponentialRampToValueAtTime(.0001,now+duration);
      if(context.createStereoPanner) {
        const position=context.createStereoPanner();
        position.pan.value=pan;
        pulse.connect(position);
        position.connect(volume);
        oscillator.onended=()=>{pulse.disconnect();position.disconnect();};
      } else {
        pulse.connect(volume);
        oscillator.onended=()=>pulse.disconnect();
      }
      oscillator.connect(pulse);
      oscillator.start(now);
      oscillator.stop(now+duration+.025);
    }

    function update(snapshot,player,buses,age) {
      if(!active || context.state!=='running' || !snapshot || player.flying) return;
      const {x,z,yaw}=player;
      const distance=row=>Math.hypot(row.x-x,row.z-z);
      const panning=row=>Math.max(-.87,Math.min(.87,((row.x-x)*Math.cos(yaw)+(row.z-z)*Math.sin(yaw))/Math.max(7,distance(row))));
      const nearby=snapshot.activities.filter(row=>row.active && (row.id==='library'||row.id==='state'))
        .reduce((best,row)=>!best || distance(row)<distance(best)?row:best,null);
      const step=Math.floor(age/rate);
      if(step!==beat) {
        beat=step;
        if(nearby && distance(nearby)<100) {
          const power=1-distance(nearby)/100,pan=panning(nearby),offset=nearby.id==='library'?3:0;
          const pitch=melody[(step+offset)%melody.length],gain=.16*power*power;
          note(hz(pitch),.42,gain,pan,'triangle');
          if(step%4===0) note(hz(pitch-12),.53,gain*.49,pan);
        }
      }
      const tick=Math.floor(age*.8);
      if(tick!==beep) {
        beep=tick;
        const sign=snapshot.crosswalks.find(row=>row.active && distance(row)<34);
        if(sign) note(650,.15,.075*(1-distance(sign)/34),panning(sign));
      }
      if(age-lastCoach>4) {
        const doors=buses.find(([bx,bz,,,open])=>open && Math.hypot(bx-x,bz-z)<26);
        if(doors) {
          const bus={x:doors[0],z:doors[1]};
          note(315,.36,.071*(1-distance(bus)/26),panning(bus),'triangle');
          lastCoach=age;
        }
      }
    }

    return {update,toggle};
  }

  window.MadisonCitySound={create};
})();
