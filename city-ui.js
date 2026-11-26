(() => {
  'use strict';

  const $=id=>document.getElementById(id);
  const count=(n,name)=>`${n} ${name}${n===1?'':'s'}`;
  function text(tag,value,className) {
    const node=document.createElement(tag);
    node.textContent=value;
    if(className) node.className=className;
    return node;
  }

  function create(city,{guide,offer,toast,sound}) {
    let lastRead=-1,snapshot=city.snapshot(),paint=-1,mapPaint=-1;
    const watch=$('city-watch');
    function read(force=false) {
      const time=performance.now();
      if(force || time-lastRead>=360) {snapshot=city.snapshot();lastRead=time;}
      return snapshot;
    }
    function toggle(open=watch.hidden) {
      watch.hidden=!open;
      $('city-toggle').setAttribute('aria-expanded',String(open));
      if(open) render(true);
    }
    function button(row) {
      const element=text('button','');
      element.type='button';
      element.append(text('strong',row.name),text('span',row.detail));
      element.setAttribute('aria-label','Set route to '+row.name);
      element.addEventListener('click',()=>guide(row));
      return element;
    }
    function mapRows(activeTarget,force=false) {
      const {activities,crosswalks,version}=read(force);
      const rows=$('map-city-list');
      if(force || mapPaint!==version) {
        mapPaint=version;
        const items=activities.map(row=>({...row,detail:(row.active?count(row.listeners,'listener'):'Starts in '+row.inTime+' s')+
          (row.supplied?' · fresh supplies':row.funded?' · community funded':'')}));
        for(const row of crosswalks) {
          const waiting=row.waiting===1?'1 person waiting':row.waiting+' people waiting';
          items.push({...row,detail:(row.active?'Walk signal holding traffic':row.waiting?waiting:'Signal crossing')+
            (row.priority?' · walk priority':'')});
        }
        rows.replaceChildren(...items.map(button));
      }
      for(const item of rows.children) item.setAttribute('aria-current',String(item.firstChild.textContent===activeTarget?.name));
    }
    function render(force=false) {
      if(watch.hidden) return;
      const {feed,stats,version}=read(force);
      if(!force && version===paint) return;
      paint=version;
      const feedRows=feed.slice(0,5).map(row=>{
        const line=text('li','');
        line.append(text('span',row.topic,'city-topic'),text('p',row.text));
        return line;
      });
      $('city-feed').replaceChildren(...feedRows);
      const statsText=count(stats.boarded,'boarding')+' · '+count(stats.walks,'walk phase');
      $('city-counts').textContent=statsText;
    }
    function update(playing) {
      const choice=playing?offer():null;
      $('city-panel').hidden=!choice;
      if(choice) {
        const label=$('city-action-label');
        if(label.textContent!==choice.action) label.textContent=choice.action;
        if($('city-place').textContent!==choice.name) $('city-place').textContent=choice.name;
        $('city-action').disabled=choice.disabled;
      }
      render();
    }
    async function toggleSound() {
      const active=await sound.toggle(),button=$('city-sound');
      button.textContent=active?'Sound on':'Sound off';
      button.setAttribute('aria-pressed',String(active));
    }
    $('city-toggle').addEventListener('click',()=>toggle());
    $('city-close').addEventListener('click',()=>toggle(false));
    $('city-sound').addEventListener('click',toggleSound);
    return {read,toggle,update,mapRows,visible:()=>!watch.hidden,notify:message=>{if(message) {toast(message);render(true);}}};
  }
  window.MadisonCityUI={create};
})();
