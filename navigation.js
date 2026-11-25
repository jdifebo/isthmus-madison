(() => {
  'use strict';

  const cellSize=55;
  const cell=(x,z)=>Math.floor(x/cellSize)+','+Math.floor(z/cellSize);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

  function create(roads) {
    const nodes=[],edges=[],cells=new Map(),shared=new Map();
    function node(x,z) {
      const tag=Math.round(x*3)+','+Math.round(z*3);
      if(shared.has(tag)) return shared.get(tag);
      const out={x,z,id:nodes.length,links:[]};
      nodes.push(out);
      shared.set(tag,out);
      return out;
    }
    for(const [name,kind,,bridge,line,rapid,driveway] of roads) {
      if(driveway) continue;
      let prior;
      for(const [x,z] of line) {
        const next=node(x,z);
        if(prior && prior!==next) {
          const edge={a:prior,b:next,name,kind,bridge,oneWay:Boolean(rapid),splits:[]};
          edges.push(edge);
          for(let ix=Math.floor(Math.min(prior.x,x)/cellSize);ix<=Math.floor(Math.max(prior.x,x)/cellSize);ix++) {
            for(let iz=Math.floor(Math.min(prior.z,z)/cellSize);iz<=Math.floor(Math.max(prior.z,z)/cellSize);iz++) {
              const key=ix+','+iz;
              if(!cells.has(key)) cells.set(key,[]);
              cells.get(key).push(edge);
            }
          }
        }
        prior=next;
      }
    }
    function project(x,z,edge) {
      const {a,b}=edge,dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
      const px=a.x+t*dx,pz=a.z+t*dz;
      return {edge,t,x:px,z:pz,offset:Math.hypot(x-px,z-pz)};
    }
    function link(a,b,edge,both=true) {
      if(a===b) return;
      const length=distance(a,b);
      a.links.push({to:b,length,...edge});
      if(both) b.links.push({to:a,length,...edge,car:edge.car && !edge.oneWay});
    }

    // Municipal paths sometimes end a few meters short of an OSM centerline.
    const degree=new Uint16Array(nodes.length),roadEnds=new Uint16Array(nodes.length);
    for(const edge of edges) {
      for(const end of [edge.a,edge.b]) {
        degree[end.id]++;
        if(edge.kind<2 && !edge.bridge) roadEnds[end.id]++;
      }
    }
    for(const end of nodes.slice()) {
      if(degree[end.id]!==1) continue;
      let nearest;
      for(const edge of cells.get(cell(end.x,end.z)) || []) {
        if(edge.bridge || edge.a===end || edge.b===end || roadEnds[end.id] && edge.kind>=2) continue;
        const hit=project(end.x,end.z,edge);
        if(hit.offset>4.2 || nearest && hit.offset>=nearest.offset) continue;
        nearest=hit;
      }
      if(!nearest) continue;
      const {edge,t,x,z}=nearest;
      const join=t<.001?edge.a:t>.999?edge.b:node(x,z);
      if(join!==edge.a && join!==edge.b) edge.splits.push({t,node:join});
      link(end,join,{name:edge.name,car:roadEnds[end.id]>0 && edge.kind<2});
    }
    for(const edge of edges) {
      const cuts=[edge.a,...edge.splits.sort((a,b)=>a.t-b.t).map(cut=>cut.node),edge.b];
      edge.sections=[];
      const style={name:edge.name,car:edge.kind<2 || edge.kind===4,oneWay:edge.oneWay};
      for(let i=1;i<cuts.length;i++) {
        const a=cuts[i-1],b=cuts[i];
        if(a===b) continue;
        link(a,b,style);
        edge.sections.push({a,b,...style});
      }
    }
    function nearby(point,car) {
      const seen=new Set(),results=[];
      const cx=Math.floor(point.x/cellSize),cz=Math.floor(point.z/cellSize);
      for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) for(const edge of cells.get((cx+dx)+','+(cz+dz)) || []) {
        if(seen.has(edge) || car && edge.kind>=2 && edge.kind!==4) continue;
        seen.add(edge);
        for(const section of edge.sections) {
          const hit=project(point.x,point.z,section);
          if(hit.offset<105) results.push(hit);
        }
      }
      const sorted=results.sort((a,b)=>a.offset-b.offset),result=[];
      const limit=Math.min(105,(sorted[0]?.offset ?? 0)+(car?16:21));
      for(const pick of sorted) {
        if(result.length===9 || pick.offset>limit) break;
        result.push(pick);
      }
      return result;
    }
    function push(heap,item) {
      let i=heap.length;
      heap.push(item);
      while(i>0) {
        const parent=(i-1)>>1;
        if(heap[parent].score<=item.score) break;
        heap[i]=heap[parent];
        i=parent;
      }
      heap[i]=item;
    }
    function pop(heap) {
      const first=heap[0],tail=heap.pop();
      if(!heap.length) return first;
      let i=0;
      while(i*2+1<heap.length) {
        let child=i*2+1;
        if(child+1<heap.length && heap[child+1].score<heap[child].score) child++;
        if(heap[child].score>=tail.score) break;
        heap[i]=heap[child];
        i=child;
      }
      heap[i]=tail;
      return first;
    }
    function plan(start,end,mode) {
      if(distance(start,end)<20) return {points:[start,end],distance:distance(start,end),hint:'Destination nearby'};
      const car=mode==='drive',access=car?2.6:1.5;
      const from=nearby(start,car),to=nearby(end,car);
      if(!from.length || !to.length) return null;
      const costs=new Float64Array(nodes.length).fill(Infinity),previous=new Array(nodes.length),queue=[],terminal=new Map();
      for(const hit of to) {
        const {a,b,oneWay}=hit.edge;
        for(const node of car && oneWay?[a]:[a,b]) {
          const cost=distance(node,hit)+hit.offset*access;
          if(cost<(terminal.get(node)?.cost ?? Infinity)) terminal.set(node,{cost,hit});
        }
      }
      for(const hit of from) {
        const {a,b,oneWay}=hit.edge;
        for(const node of car && oneWay?[b]:[a,b]) {
          const cost=distance(node,hit)+hit.offset*access;
          if(cost>=costs[node.id]) continue;
          costs[node.id]=cost;
          previous[node.id]={hit};
          push(queue,{node,cost,score:cost+distance(node,end)});
        }
      }
      let winner,best=Infinity;
      for(const first of from) for(const last of to) {
        if(first.edge!==last.edge || car && first.edge.oneWay && first.t>last.t) continue;
        const cost=(first.offset+last.offset)*access+distance(first,last);
        if(cost<best) {winner={direct:[first,last]};best=cost;}
      }
      while(queue.length) {
        const {node,cost,score}=pop(queue);
        if(score>=best) break;
        if(cost!==costs[node.id]) continue;
        const candidate=terminal.get(node);
        if(candidate && cost+candidate.cost<best) { winner={node,hit:candidate.hit};best=cost+candidate.cost; }
        for(const link of node.links) {
          const {to,length,name}=link;
          if(car && !link.car || cost+length>=costs[to.id]) continue;
          const next=cost+length;
          costs[to.id]=next;
          previous[to.id]={node,name};
          push(queue,{node:to,cost:next,score:next+distance(to,end)});
        }
      }
      if(!winner) return null;
      if(winner.direct) {
        const [first,last]=winner.direct;
        const length=first.offset+last.offset+distance(first,last);
        return {points:[start,first,last,end],distance:length,hint:first.edge.name?'Follow '+first.edge.name:'Follow the highlighted route'};
      }
      const points=[end,winner.hit];
      let current=winner.node,firstRoad='';
      while(current) {
        const p=previous[current.id];
        points.push({x:current.x,z:current.z,street:p.name});
        if(p.name) firstRoad=p.name;
        if(p.hit) points.push(p.hit);
        current=p.node;
      }
      points.push(start);
      points.reverse();
      let total=0,hint=firstRoad?'Follow '+firstRoad:'Follow the highlighted route';
      for(let i=1;i<points.length;i++) total+=distance(points[i-1],points[i]);
      let ahead=distance(points[0],points[1]);
      for(let i=2;i<points.length-2;i++) {
        const a=points[i-1],b=points[i],c=points[i+1];
        ahead+=distance(a,b);
        const before=Math.atan2(b.x-a.x,-(b.z-a.z)),after=Math.atan2(c.x-b.x,-(c.z-b.z));
        const angle=Math.atan2(Math.sin(after-before),Math.cos(after-before));
        if(ahead>7 && b.street && c.street && b.street!==c.street && Math.abs(angle)>.53) {
          hint=`${Math.round(ahead/5)*5} m · ${angle>0?'Right':'Left'} onto ${c.street}`;
          break;
        }
      }
      return {points,distance:total,hint};
    }

    return {plan};
  }

  window.MadisonNavigation={create};
})();
