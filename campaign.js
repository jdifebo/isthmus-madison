(() => {
  'use strict';

  const sites={
    books:{name:'University Book Store',address:'711 State Street',x:-1130.5,z:-19.6,yaw:3.12,reach:5.2},
    union:{name:'Memorial Union Terrace',address:'Lake Mendota',x:-1249,z:-230,yaw:-.13,reach:7},
    cheese:{name:'Fromagination',address:'12 South Carroll Street',x:-65.1,z:132.9,yaw:-2.34,reach:4.5},
    monona:{name:'Monona Terrace',address:'East Wilson Street approach',x:238,z:229,yaw:2.35,reach:7},
    capitol:{name:'Capitol Square',address:'State Street approach',x:-151,z:-4,yaw:1.57,reach:8},
    park:{name:'James Madison Park',address:'East Gorham Street',x:135,z:-777,yaw:-.65,reach:8},
    field:{name:'Breese Stevens Field',address:'North Paterson Street',x:839,z:-886,yaw:.73,reach:8},
    studio:{name:'Bassett Studio',address:'West Dayton Street · fictional property',x:-557,z:262,yaw:-.56,reach:5},
    workshop:{name:'East Wash Workshop',address:'Livingston Street · fictional property',x:716,z:-733,yaw:-.57,reach:5}
  };
  const arrival={...sites.books,x:-1120,z:-27.8,yaw:-2.47};
  const items={
    guides:['Neighborhood guides','A carton of printed guides for the Terrace welcome table.'],
    samples:['Tasting box','A boxed Wisconsin cheese tasting for the Monona Terrace gathering.'],
    film:['Disposable camera','A loaner camera for the postcard project.'],
    postcards:['Isthmus postcard set','Your views of Lake Mendota, the Capitol and Lake Monona.'],
    notes:['Tasting notes','A handwritten introduction to Wisconsin cheese.'],
    pairing:['Picnic recipe card','A small keepsake from the Terrace table.'],
    books:['Library donation box','A donation for the community book table at James Madison Park.'],
    cooler:['Insulated cheese crate','A catering drop for the crew at Breese Stevens Field.'],
    studioKey:['Bassett Studio key','Your home base on West Dayton Street.'],
    shopKey:['Workshop key','The keys to your East Wash Workshop.']
  };
  const quests={
    first:{kind:'Main',title:'A First Shift',brief:'Help put together a lakeside welcome table.',steps:[
      {site:'books',objective:'Meet the volunteer at the University Book Store',label:'Pick up the neighborhood guides',detail:'Mara has a carton of guides headed to the Terrace welcome table.',give:'guides'},
      {site:'union',objective:'Bring the guides to Memorial Union Terrace',label:'Drop off the guides',detail:'Mara’s friend Jules is setting up near the lake.',take:'guides',pay:45}
    ]},
    across:{kind:'Main',title:'Across the Isthmus',requires:'first',brief:'Help stock a community gathering on the Monona side.',steps:[
      {site:'cheese',objective:'Pick up the tasting at Fromagination',label:'Collect the tasting box',detail:'A tasting box is ready for the community gathering across the isthmus.',give:'samples'},
      {site:'monona',objective:'Take the tasting box to Monona Terrace',label:'Deliver the tasting box',detail:'Meet the event volunteer at the East Wilson Street approach.',take:'samples',pay:70}
    ]},
    home:{kind:'Main',title:'A Place of Your Own',requires:'across',brief:'Finish a side quest or some shifts to put together $140 for a home base.',steps:[
      {site:'studio',objective:'Buy Bassett Studio',property:'studio'}
    ]},
    views:{kind:'Side',title:'Three Good Views',requires:'first',brief:'Make a set of postcards from places the guides sent people to.',steps:[
      {site:'union',objective:'Ask Jules about the postcard project',label:'Borrow a camera',detail:'Jules has a camera and a short list of views to capture.',give:'film'},
      {site:'union',objective:'Photograph the Lake Mendota waterfront',label:'Take the Lake Mendota photo',detail:'Frame the boats and the shoreline from the Terrace.',photo:true},
      {site:'capitol',objective:'Photograph the Capitol from the end of State Street',label:'Take the Capitol photo',detail:'Use the view up the Capitol steps.',photo:true},
      {site:'monona',objective:'Photograph Monona Terrace',label:'Take the Monona Terrace photo',detail:'Finish the set with the curve of the convention center.',photo:true,take:'film',give:'postcards',pay:55}
    ]},
    picnic:{kind:'Side',title:'The Picnic List',requires:'across',brief:'Put together a Wisconsin picnic card for the welcome table.',steps:[
      {site:'cheese',objective:'Ask about the picnic list at Fromagination',label:'Collect the tasting notes',detail:'Pick up a few ideas for a simple cheese picnic.',give:'notes'},
      {site:'union',objective:'Share the tasting notes with Jules',label:'Put together the picnic card',detail:'Jules adds the finishing touches to the picnic list.',take:'notes',give:'pairing',pay:50}
    ]}
  };
  const jobs={
    bookRun:{title:'Little Library Run',site:'books',destination:'park',item:'books',pay:32,
      brief:'Carry a donation box from the book store to the community table at James Madison Park.'},
    cheeseRun:{title:'Match Day Catering',site:'cheese',destination:'field',item:'cooler',pay:46,
      brief:'Bring an insulated delivery to the crew at Breese Stevens Field.'}
  };
  const properties={
    studio:{price:140,key:'studioKey',requires:'across',brief:'A small home base with a bed and a return point.'},
    workshop:{price:265,key:'shopKey',requires:'home',brief:'A second return point. Owning it adds $12 to every delivery job.'}
  };
  const terraceSeat={x:-1249.4,z:-236.5,yaw:-.20};
  const contacts=[[-1127.4,-18.1,0,-1],[-1251.3,-227.5,0,-1],[-63.6,135.3,.72,-.69],
    [235.8,231.6,0,-1],[132.8,-774.4,0,-1],[836.8,-883.4,.2,-1]];
  const saveKey='isthmus-campaign-v1';
  const count=(n,max=999999)=>Number.isFinite(n)?Math.min(max,Math.max(0,Math.floor(n))):0;
  const money=n=>'$'+n.toLocaleString('en-US');
  const jpeg=value=>typeof value==='string' && value.length<85000 && /^data:image\/jpeg;base64,[a-z0-9+/]+=*$/i.test(value);

  function open(storage) {
    let canSave=Boolean(storage);
    function read() {
      try { return JSON.parse(storage?.getItem(saveKey)) || {}; }
      catch { return {}; }
    }
    function normalize(raw) {
      const state={cash:count(raw.cash),steps:{},pack:{},photos:{},owned:{},runs:{},job:null,tracked:null,last:'books'};
      for(const [id,quest] of Object.entries(quests)) state.steps[id]=count(raw.steps?.[id],quest.steps.length);
      for(const id of Object.keys(items)) if(count(raw.pack?.[id],99)) state.pack[id]=count(raw.pack[id],99);
      for(const id of Object.keys(properties)) if(raw.owned?.[id]===true) state.owned[id]=true;
      for(const id of Object.keys(jobs)) state.runs[id]=count(raw.runs?.[id]);
      for(const {site,photo} of quests.views.steps) if(photo && jpeg(raw.photos?.[site])) state.photos[site]=raw.photos[site];
      if(Object.hasOwn(jobs,raw.job)) state.job=raw.job;
      if(typeof raw.tracked==='string') state.tracked=raw.tracked;
      if(Object.hasOwn(sites,raw.last)) state.last=raw.last;
      return state;
    }
    let state=normalize(read());
    function sync() { if(canSave) state=normalize(read()); }
    function commit(next) {
      state=next;
      try { storage?.setItem(saveKey,JSON.stringify(state)); }
      catch { canSave=false; }
    }
    const done=(id,s=state)=>s.steps[id]===quests[id].steps.length;
    const unlocked=(entry,s=state)=>!entry.requires || done(entry.requires,s);
    const main=()=>Object.keys(quests).find(id=>quests[id].kind==='Main'&&!done(id));
    const payFor=job=>job.pay+(state.owned.workshop?12:0);

    function entries() {
      const rows={quests:[],jobs:[],properties:[]};
      for(const [id,quest] of Object.entries(quests)) {
        const step=quest.steps[state.steps[id]],available=Boolean(step)&&unlocked(quest);
        const target=available?step.site:null;
        let objective=available?step.objective:done(id)?'Completed':'Unlocks after '+quests[quest.requires].title;
        if(available && step.property && state.cash<properties[step.property].price) {
          objective+=' · '+money(properties[step.property].price-state.cash)+' still needed';
        }
        rows.quests.push({key:'q:'+id,title:quest.title,kind:quest.kind,brief:quest.brief,objective,target,
          status:done(id)?'Complete':available?`${state.steps[id]+1} / ${quest.steps.length}`:'Locked'});
      }
      for(const [id,job] of Object.entries(jobs)) {
        const active=state.job===id;
        rows.jobs.push({key:'j:'+id,title:job.title,kind:'Odd job',brief:job.brief,active,
          objective:active?'Deliver to '+sites[job.destination].name:'Pick up at '+sites[job.site].name,
          target:active?job.destination:job.site,status:active?'On shift':money(payFor(job))+' per run',runs:state.runs[id]});
      }
      for(const [id,property] of Object.entries(properties)) {
        const owned=Boolean(state.owned[id]),available=unlocked(property);
        rows.properties.push({key:'p:'+id,title:sites[id].name,kind:'Property',brief:property.brief,owned,
          objective:owned?sites[id].address:available?'Visit the property to buy it':'Unlocks after '+quests[property.requires].title,
          status:owned?'Owned':available?money(property.price):'Locked',target:available?id:null});
      }
      return rows;
    }

    function view() {
      const list=entries(),all=Object.values(list).flat();
      const tracked=all.find(row=>row.key===state.tracked && row.target)
        || list.quests.find(row=>row.key==='q:'+main() && row.target)
        || list.jobs.find(row=>row.active) || null;
      return {...list,tracked,cash:state.cash,job:state.job,last:state.last,canSave,hasSave:state.last!=='books'||
        Object.values(state.steps).some(Boolean)||Boolean(state.job)||Object.values(state.runs).some(Boolean),chapterComplete:done('home'),
        photos:Object.entries(state.photos).map(([site,src])=>({src,name:sites[site].name})),
        pack:Object.entries(state.pack).map(([id,quantity])=>({id,quantity,name:items[id][0],detail:items[id][1]}))};
    }

    function actionsAt(site) {
      const actions=[];
      for(const [id,quest] of Object.entries(quests)) {
        const index=state.steps[id],step=quest.steps[index];
        if(step?.site!==site || !step.label || !unlocked(quest)) continue;
        actions.push({id:`q:${id}:${index}`,title:step.label,detail:step.detail,kind:quest.kind,photo:step.photo});
      }
      for(const [id,job] of Object.entries(jobs)) {
        if(state.job===id && site===job.destination) actions.push({id:`j:${id}:deliver`,title:'Complete '+job.title,
          detail:'Hand over your delivery and earn '+money(payFor(job))+'.',kind:'Odd job'});
        else if(site===job.site && !state.job) actions.push({id:`j:${id}:accept`,title:'Take '+job.title,
          detail:job.brief+' Earn '+money(payFor(job))+'.',kind:'Odd job'});
      }
      const property=properties[site];
      if(property && unlocked(property)) {
        if(state.owned[site]) actions.push({id:`p:${site}:rest`,title:'Rest until golden hour',detail:'Set your return point here and advance the light.',kind:'Property'});
        else actions.push({id:`p:${site}:buy`,title:'Buy '+sites[site].name+' · '+money(property.price),
          detail:state.cash>=property.price?property.brief:money(property.price-state.cash)+' still needed. Try the job board in your journal.',
          kind:'Property',disabled:state.cash<property.price});
      }
      if(site==='union') actions.push({id:'seat:union:sit',title:'Sit in a Terrace chair',
        detail:'Take a moment to watch the boats on Lake Mendota.',kind:'Terrace'});
      return actions;
    }

    function nearby(x,z) {
      let nearest=null,distance=Infinity;
      for(const [id,site] of Object.entries(sites)) {
        const d=Math.hypot(site.x-x,site.z-z);
        if(d>site.reach || d>=distance || !actionsAt(id).length) continue;
        nearest=id;
        distance=d;
      }
      return nearest;
    }

    function perform(site,action,photo) {
      sync();
      const choice=actionsAt(site).find(entry=>entry.id===action && !entry.disabled);
      if(!choice) return null;
      const [kind,id,verb]=choice.id.split(':');
      if(kind==='seat') return {seat:terraceSeat,message:'Press E to stand up'};
      const next={...state,steps:{...state.steps},pack:{...state.pack},owned:{...state.owned},runs:{...state.runs},last:site};
      let award=0,message,rest=false;
      function put(item) { if(item) next.pack[item]=(next.pack[item] || 0)+1; }
      function take(item) {
        if(!item) return true;
        if(!next.pack[item]) return false;
        if(--next.pack[item]===0) delete next.pack[item];
        return true;
      }
      if(kind==='q') {
        const quest=quests[id],step=quest.steps[Number(verb)];
        if(!take(step.take)) return null;
        put(step.give);
        if(step.photo && jpeg(photo)) next.photos={...next.photos,[site]:photo};
        next.steps[id]++;
        award=step.pay || 0;
        if(quest.kind==='Side') next.tracked=done(id,next)?null:'q:'+id;
        else if(state.tracked==='q:'+id && done(id,next)) next.tracked=null;
        message=done(id,next)?quest.title+' complete':step.label.replace(/^Pick up /,'Picked up ');
      } else if(kind==='j') {
        const job=jobs[id];
        if(verb==='accept') {
          put(job.item);
          next.job=id;
          next.tracked='j:'+id;
          message='Shift started · '+job.title;
        } else {
          if(!take(job.item)) return null;
          next.job=null;
          next.runs[id]++;
          next.tracked=state.tracked==='j:'+id?null:state.tracked;
          award=payFor(job);
          message='Delivery complete';
        }
      } else if(verb==='buy') {
        const property=properties[id];
        next.cash-=property.price;
        next.owned[id]=true;
        if(next.tracked==='p:'+id) next.tracked=null;
        put(property.key);
        const firstHome=id==='studio'&&!done('home');
        if(firstHome) next.steps.home=quests.home.steps.length;
        message=firstHome?'You have a home on the isthmus · Chapter complete':sites[id].name+' purchased';
      } else {
        message='Rested at '+sites[id].name;
        rest=true;
      }
      next.cash=count(next.cash+award);
      commit(next);
      return {message:message+(award?' · +'+money(award):''),rest};
    }

    function track(key) {
      sync();
      if(!Object.values(entries()).flat().some(entry=>entry.key===key && entry.target)) return false;
      if(key!==state.tracked) commit({...state,tracked:key});
      return true;
    }

    function abandonJob() {
      sync();
      if(!state.job) return false;
      const pack={...state.pack};
      delete pack[jobs[state.job].item];
      commit({...state,pack,tracked:state.tracked==='j:'+state.job?null:state.tracked,job:null});
      return true;
    }

    function returnHome(site) {
      sync();
      if(!state.owned[site]) return false;
      if(state.last!==site) commit({...state,last:site});
      return true;
    }

    return {view,actionsAt,nearby,perform,track,sync,abandonJob,returnHome};
  }

  window.MadisonCampaign={sites,arrival,open,money,saveKey,terraceSeat,contacts};
})();
