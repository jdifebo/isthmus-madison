(() => {
  'use strict';

  const {sites,money,saveKey}=MadisonCampaign;
  const $=id=>document.getElementById(id);

  function create(model,{nearby,pause,onAction,onReturn,canReturn,onTrack,capture,localAction,onRestore}) {
    const journal=$('journal'),encounter=$('encounter');
    const tabs=[...$('journal-tabs').querySelectorAll('button')];
    let page='quests',snapshot=model.view();
    function text(tag,content,className) {
      const node=document.createElement(tag);
      node.textContent=content;
      if(className) node.className=className;
      return node;
    }
    function set(id,value) {
      const node=$(id);
      if(node.textContent!==value) node.textContent=value;
    }
    function button(label,handler,disabled=false) {
      const node=text('button',label,'glass small');
      node.type='button';
      node.disabled=disabled;
      node.addEventListener('click',handler);
      return node;
    }
    function refresh() {
      snapshot=model.view();
      set('story-balance',money(snapshot.cash));
      set('story-start',snapshot.hasSave?'Continue story':'Start the story');
      set('journal-balance',money(snapshot.cash));
      set('save-status',snapshot.canSave?'Progress saves in this browser.':'Progress is available for this session.');
    }
    function renderJournal() {
      const list=$('journal-list');
      list.replaceChildren();
      $('journal-complete').hidden=!snapshot.chapterComplete || page!=='quests';
      $('dispatch-status').hidden=page!=='jobs';
      const n=snapshot.dispatchCount;
      if(page==='jobs') set('dispatch-status',n===1?'1 City Dispatch shift completed':n+' City Dispatch shifts completed');
      for(const tab of tabs) tab.setAttribute('aria-pressed',String(tab.dataset.page===page));
      if(page==='inventory') {
        if(!snapshot.pack.length) list.append(text('li','Your bag is empty.','journal-empty'));
        for(const item of snapshot.pack) {
          const row=text('li','','journal-row'),details=text('div','');
          details.append(text('h3',item.name),text('p',item.detail));
          row.append(details,text('span','×'+item.quantity,'journal-status'));
          list.append(row);
        }
        if(snapshot.photos.length) {
          const row=text('li','','journal-photos');
          row.append(text('h3','Postcard photos'));
          const photos=text('div','','postcard-grid');
          for(const photo of snapshot.photos) {
            const figure=document.createElement('figure'),image=document.createElement('img');
            image.src=photo.src;
            image.alt=photo.name;
            figure.append(image,text('figcaption',photo.name));
            photos.append(figure);
          }
          row.append(photos);
          list.append(row);
        }
        return;
      }
      for(const entry of snapshot[page]) {
        const selected=snapshot.tracked?.key===entry.key;
        const row=text('li','','journal-row'),details=text('div','');
        if(selected) row.classList.add('tracked');
        details.append(text('p',entry.kind,'eyebrow'),text('h3',entry.title),text('p',entry.brief),
          text('p',entry.objective,'journal-goal'));
        if(entry.demand) details.append(text('p',entry.demand,'journal-runs'));
        if(entry.runs) details.append(text('p',entry.runs+' completed','journal-runs'));
        const aside=text('div','','journal-actions');
        aside.append(text('span',entry.status,'journal-status'));
        if(entry.owned) {
          aside.append(button('Return here',()=>{
            if(!model.returnHome(entry.target)) return;
            journal.close();
            refresh();
            onReturn(sites[entry.target]);
          },!canReturn()));
        } else if(entry.target || entry.needsRide) {
          const track=button(selected?'Tracked':'Track',()=>{
            if(track(entry.key)) {
              onTrack();
              journal.close();
            }
          },selected);
          track.setAttribute('aria-label',(selected?'Tracking ':'Track ')+entry.title);
          aside.append(track);
        }
        if(entry.active) aside.append(button('Cancel shift',()=>{
          if(!model.abandonJob()) return;
          refresh();
          renderJournal();
          onTrack();
        }));
        row.append(details,aside);
        list.append(row);
      }
    }
    function openJournal(section='quests') {
      page=section;
      pause();
      model.sync();
      refresh();
      renderJournal();
      if(!journal.open) journal.showModal();
    }
    function openEncounter() {
      const id=nearby();
      if(!id || encounter.open) return;
      const site=sites[id],actions=model.actionsAt(id);
      const activity=localAction();
      if(activity) actions.push(activity);
      if(!actions.length) return;
      pause();
      set('encounter-title',site.name);
      set('encounter-address',site.address);
      const list=$('encounter-list');
      list.replaceChildren();
      for(const choice of actions) {
        const row=text('li','','encounter-row');
        const description=text('p',choice.detail);
        description.id='choice-'+choice.id.replaceAll(':','-');
        const action=button(choice.title,()=>{
          if(nearby()!==id) return;
          if(choice.activate) {
            encounter.close();
            choice.activate();
            return;
          }
          const result=model.perform(id,choice.id,choice.photo?capture():undefined,choice.rush);
          if(choice.live && !result) return;
          encounter.close();
          refresh();
          if(result) onAction(result,site);
        },choice.disabled);
        if(choice.live) action.id='action-'+choice.id.replaceAll(':','-');
        action.setAttribute('aria-describedby',description.id);
        row.append(text('p',choice.kind,'eyebrow'),action,description);
        list.append(row);
      }
      encounter.showModal();
    }
    function update(x,z,playing,seated=false) {
      const entry=playing?snapshot.tracked:null,site=entry && sites[entry.target],near=playing?nearby():null;
      $('story-objective').hidden=!entry;
      if(entry) {
        set('objective-title',entry.title);
        set('objective-step',entry.objective);
        const distance=site?Math.hypot(site.x-x,site.z-z):null;
        set('objective-distance',distance===null?'Route A':distance>=1000?(distance/1000).toFixed(1)+' km':Math.round(distance)+' m');
      }
      $('encounter-panel').hidden=!near && !seated;
      if(near || seated) {
        set('encounter-place',seated?'Terrace chair':sites[near].name);
        set('encounter-label',seated?'Stand up':'Interact');
      }
      if(near && encounter.open) {
        for(const choice of model.actionsAt(near).filter(row=>row.live)) {
          const key=choice.id.replaceAll(':','-'),button=$('action-'+key);
          if(!button) continue;
          button.disabled=choice.disabled;
          set('choice-'+key,choice.detail);
        }
      }
    }
    $('journal-toggle').addEventListener('click',()=>openJournal());
    $('journal-close').addEventListener('click',()=>journal.close());
    $('encounter-close').addEventListener('click',()=>encounter.close());
    for(const tab of tabs) tab.addEventListener('click',()=>openJournal(tab.dataset.page));
    window.addEventListener('storage',event=>{
      if(event.key!==null && event.key!==saveKey) return;
      model.sync();
      refresh();
      onRestore(snapshot);
      if(journal.open) renderJournal();
    });
    refresh();
    onRestore(snapshot);
    function track(key) {
      if(!model.track(key)) return false;
      refresh();
      return true;
    }
    return {openJournal,openEncounter,update,refresh,track,tracked:()=>snapshot.tracked,
      objectives:()=>[...snapshot.quests,...snapshot.jobs.filter(job=>job.active)].filter(row=>row.target || row.needsRide),
      closeJournal:()=>journal.close(),modalOpen:()=>journal.open||encounter.open,journalOpen:()=>journal.open,
      target:()=>snapshot.tracked && sites[snapshot.tracked.target]};
  }

  window.MadisonCampaignUI={create};
})();
