import { readdir, readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const cache = new URL('../.cache/', import.meta.url);
const files = await readdir(cache);
const json = async file => JSON.parse(await readFile(new URL(file, cache)));
const features = async prefix => (
  await Promise.all(files.filter(file => file.startsWith(prefix + '-') && /^.+-\d+\.json$/.test(file)).map(json))
).flatMap(collection => collection.features);

const origin = [-89.38412, 43.07469];
const meters = [111320 * Math.cos(origin[1] * Math.PI / 180), 111132];
const bounds = [-2060, -1490, 2080, 1135];
const project = ([lon, lat]) => [
  Math.round((lon - origin[0]) * meters[0] * 10) / 10,
  Math.round((origin[1] - lat) * meters[1] * 10) / 10
];
const pointInRing = ([x, z], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
};

function path(points) {
  return points.map(project).filter(([x,z], i, ring) => i === 0 || x !== ring[i-1][0] || z !== ring[i-1][1]);
}

function polygons(geometry) {
  if (!geometry) return [];
  const list = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return list.map(polygon => polygon.map(ring => {
    const projected = path(ring);
    if (projected.length && projected[0].join() === projected.at(-1).join()) projected.pop();
    return projected;
  }).filter(ring => ring.length >= 3)).filter(polygon => polygon.length);
}

function unpackTile(buffer) {
  const chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const size = buffer.readUInt32BE(offset);
    if (buffer.toString('ascii', offset+4, offset+8) === 'IDAT') chunks.push(buffer.subarray(offset+8, offset+8+size));
    offset += size+12;
  }
  if (buffer[24] !== 8 || buffer[25] !== 2 || buffer[28] !== 0) throw new Error('Unsupported Terrarium PNG format');
  const raw = inflateSync(Buffer.concat(chunks));
  const pixels = new Uint8Array(256*256*3);
  for (let y = 0, index = 0; y < 256; y++) {
    const filter = raw[index++];
    for (let x = 0; x < 768; x++) {
      const target = y*768+x;
      const left = x >= 3 ? pixels[target-3] : 0;
      const up = y > 0 ? pixels[target-768] : 0;
      const diagonal = x >= 3 && y > 0 ? pixels[target-771] : 0;
      const p = left + up - diagonal;
      const a = Math.abs(p-left), b = Math.abs(p-up), c = Math.abs(p-diagonal);
      const predictor = [0, left, up, (left+up)>>1, a<=b && a<=c ? left : b<=c ? up : diagonal][filter];
      pixels[target] = raw[index++] + predictor;
    }
  }
  return pixels;
}

const tiles = new Map();
for (const file of files.filter(name => /^height-\d+-\d+\.png$/.test(name))) {
  tiles.set(file.slice(7, -4), unpackTile(await readFile(new URL(file, cache))));
}

function elevation(x, z) {
  const lon = x/meters[0] + origin[0], lat = origin[1] - z/meters[1];
  const px = (lon+180)/360 * 8192*256 - 0.5;
  const py = (1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2 * 8192*256 - 0.5;
  function sample(tx, ty) {
    const tile = tiles.get(Math.floor(tx/256)+'-'+Math.floor(ty/256));
    if (!tile) throw new Error('Missing elevation tile for ' + [x,z]);
    const i = 3*((ty%256)*256 + tx%256);
    return tile[i]*256+tile[i+1]+tile[i+2]/256-32768;
  }
  const ix = Math.floor(px), iy = Math.floor(py), fx = px-ix, fy = py-iy;
  return (sample(ix,iy)*(1-fx)+sample(ix+1,iy)*fx)*(1-fy) + (sample(ix,iy+1)*(1-fx)+sample(ix+1,iy+1)*fx)*fy;
}

const gridWidth = 260, gridDepth = 165;
const elevations = [];
for (let z = 0; z <= gridDepth; z++) {
  for (let x = 0; x <= gridWidth; x++) {
    elevations.push(Math.round((elevation(
      bounds[0]+(bounds[2]-bounds[0])*x/gridWidth,
      bounds[1]+(bounds[3]-bounds[1])*z/gridDepth
    )-255)*16));
  }
}
const terrain = [gridWidth, gridDepth, Int16Array.from(elevations).buffer];

const roads = [], namedRoads = new Set();
const heights = new Map();
const osm = files.includes('osm-streets.json') ? await json('osm-streets.json') : null;
const roadWidth = {motorway: 12, trunk: 12, primary: 15, secondary: 12, tertiary: 10, residential: 8, unclassified: 7, living_street: 6, service: 4.5, pedestrian: 8, cycleway: 3, footway: 2, path: 1.8, steps: 1.8, track: 3};
for (const {tags = {}, geometry} of osm?.elements ?? []) {
  if (!geometry) continue;
  const line = path(geometry.map(({lon,lat}) => [lon,lat]));
  if (tags.building && line.length > 3) {
    line.pop();
    const height = parseFloat(tags.height) * (tags.height?.includes('ft') ? 0.3048 : 1) || parseFloat(tags['building:levels'])*3.35;
    if (!(height > 0 && height < 110)) continue;
    const cx = line.reduce((sum,p)=>sum+p[0],0)/line.length;
    const cz = line.reduce((sum,p)=>sum+p[1],0)/line.length;
    const key = Math.floor(cx/50)+','+Math.floor(cz/50);
    if (!heights.has(key)) heights.set(key, []);
    heights.get(key).push([cx,cz,height,line]);
  } else if (roadWidth[tags.highway] && line.length > 1 && !tags.area && !tags.tunnel && tags.location !== 'underground') {
    const type = tags.highway;
    const name = tags.name || '';
    const lanes = Number(tags.lanes) || 0;
    const driveway = type==='service' && tags.service==='driveway';
    const dividedEastWash = name === 'East Washington Avenue' && tags.oneway === 'yes';
    const width = driveway ? 2.9 : dividedEastWash ? (lanes || 3)*3.31+1.0 :
      Math.max(roadWidth[type], lanes > 2 ? lanes*3.05+1.2 : 0);
    const isPath = ['footway','cycleway','path','steps','track'].includes(type);
    const kind = type === 'pedestrian' || name === 'State Street' ? 2 : isPath ? 3 : type === 'service' ? 4 : width >= 10 ? 0 : 1;
    if (isPath && tags.footway === 'sidewalk') continue;
    const rapidLane = dividedEastWash && lanes !== 2 && geometry.some(point => point.lon > -89.3787);
    roads.push([name,kind,width,tags.bridge && tags.bridge !== 'no' ? 1 : 0,line,rapidLane ? 1 : 0,driveway ? 1 : 0]);
    if (name) namedRoads.add(name.toLowerCase());
  }
}

for (const {geometry, properties:p} of await features('roads')) {
  if (!geometry || p.RdStatus !== 'Constructed' || namedRoads.has(p.fullStreetName?.toLowerCase())) continue;
  if (osm && !p.fullStreetName) continue;
  const width = Math.max(p.RdCode === 'Local Road' ? 8 : 11, (p.MPO_Lanes || 1)*3.1+1.3);
  const kind = p.BaseName === 'State' ? 2 : width >= 10 ? 0 : 1;
  for (const line of geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates) {
    const points = path(line);
    if (points.length > 1) roads.push([p.fullStreetName || '',kind,width,0,points]);
  }
}

if (!osm) {
  for (const {geometry, properties:p} of await features('paths')) {
    if (!geometry || p.Status !== 'Existing') continue;
    for (const line of geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates) {
      const points = path(line);
      if (points.length > 1) roads.push([p.path_name?.trim() || '',3,Math.max(1.3,Math.min(5,(p.path_width || 8)*.3048)),0,points]);
    }
  }
}

const houses = [];
for (const feature of await features('buildings')) {
  const p = feature.properties;
  const kind = p.BuildingCl === 'Secondary' ? 2 : p.BuildingUs === 'Residential' ? 1 : 0;
  for (const polygon of polygons(feature.geometry)) {
    const ring = polygon[0];
    const x = ring.reduce((sum,point)=>sum+point[0],0)/ring.length;
    const z = ring.reduce((sum,point)=>sum+point[1],0)/ring.length;
    let closest = 27, measured = 0;
    for (let dx=-1; dx<=1;dx++) for (let dz=-1;dz<=1;dz++) {
      const nearby = heights.get([Math.floor(x/50)+dx,Math.floor(z/50)+dz].join(','));
      for (const [tx,tz,height,outline] of nearby || []) {
        const distance = Math.hypot(tx-x,tz-z);
        if (distance < closest && (pointInRing([tx,tz],ring) || pointInRing([x,z],outline))) {
          closest = distance;
          measured = height;
        }
      }
    }
    houses.push([p.FID, p.Name?.trim() || '', kind, Math.round(measured*10)/10, polygon]);
  }
}
const water = (await features('water')).flatMap(f => polygons(f.geometry));
const parks = (await features('parks')).flatMap(f => polygons(f.geometry).map(p => [f.properties.Park_Name,p]));
const inventory = await features('tree-inventory');
function treeGroup(species) {
  if (/pine|spruce|fir|larch|hemlock|cedar|arborvitae/i.test(species)) return 3;
  if (/locust|birch|aspen|ginkgo/i.test(species)) return 1;
  if (/elm|linden|hackberry|sycamore|ash|cottonwood|plane/i.test(species)) return 2;
  if (/crab|lilac|serviceberry|pear|cherry|hawthorn|plum|dogwood|magnolia/i.test(species)) return 4;
  return 0;
}
const trees = (inventory.length ? inventory : await features('trees')).flatMap(({geometry,properties})=>{
  const species=properties.SPP_COM || '';
  if (!geometry || /vacant|stump/i.test(species) || properties.STATUS && properties.STATUS !== 'Active') return [];
  const diameter=Math.min(65,Math.max(0,Number(properties.DIAMETER)||0));
  return [[...project(geometry.coordinates),Math.round(diameter),treeGroup(species)]];
});
const stationFeatures=await features('brt-stations');
const brtStations=stationFeatures
  .filter(f=>f.geometry?.type==='Point' && f.properties.Type==='center' &&
    ['Blair','Paterson','Baldwin'].includes(f.properties.NAME))
  .map(f=>[f.properties.NAME,...project(f.geometry.coordinates)])
  .sort((a,b)=>a[1]-b[1]);
const brtFeatures=await features('brt-routes');
const brtCenterlines=brtFeatures
  .filter(f=>f.geometry?.type==='LineString' && f.properties.LPA===3 &&
    ['C','E'].includes(f.properties.Corridor) &&
    f.geometry.coordinates.some(([lon,lat])=>lon> -89.379 && lat>43.078))
  .map(f=>path(f.geometry.coordinates));
const downtownSections=new Map(brtFeatures.filter(f=>f.properties.LPA===3 && f.properties.Corridor==='C')
  .map(f=>[f.properties.OBJECTID,path(f.geometry.coordinates)]));
// The MPO pieces follow the normal Route A approaches via Main eastbound and Mifflin westbound.
const southSquare=downtownSections.get(9);
const rapidDowntown=southSquare && [10,11,12,17,18].every(id=>downtownSections.has(id))?[
  [1,[18,11,9].flatMap(id=>downtownSections.get(id))],
  [-1,[...southSquare.slice(-3).reverse(),...[10,12,17].flatMap(id=>downtownSections.get(id))]]
]:[];
const curbPoint=name=>stationFeatures.filter(f=>f.geometry?.type==='Point' && f.properties.NAME===name)
  .map(f=>project(f.geometry.coordinates));
const campus=curbPoint('East Campus').sort((a,b)=>b[1]-a[1]);
const brtCurbStops=[
  ['campus-east','East Campus',1,campus[0]],['campus-west','East Campus',-1,campus[1]],
  ['state-east','State Street',1,[-420,-9]],['state-west','State Street',-1,[-585,-14]],
  ['square-east','Capitol Square',1,curbPoint('Main and Carroll')[0]],
  ['square-west','Capitol Square',-1,curbPoint('Mifflin and Pinckney')[0]]
].filter(([, , ,point])=>point);
const trafficSignals=(await features('traffic-signals'))
  .filter(f=>f.geometry?.type==='Point' && f.properties.Status==='Current' && f.properties.IntControl==='SL')
  .map(f=>project(f.geometry.coordinates));
const lots=[];
const seenLots=new Set();
for(const feature of await features('lots')) {
  for(const polygon of polygons(feature.geometry)) {
    const ring=polygon[0];
    const a=Math.abs(ring.reduce((sum,[x,z],i)=>{
      const [nx,nz]=ring[(i+1)%ring.length];
      return sum+x*nz-z*nx;
    },0))/2;
    if(a<62 || a>6500) continue;
    const signature=ring.map(([x,z])=>x+','+z).sort().join(';');
    if(seenLots.has(signature)) continue;
    seenLots.add(signature);
    lots.push(polygon);
  }
}
const map = {
  origin, meters, bounds, roads, houses, water, parks, trees, lots, brtStations, brtCenterlines, rapidDowntown, brtCurbStops,
  trafficSignals, osm: Boolean(osm),
  terrain: [terrain[0], terrain[1], Buffer.from(terrain[2]).toString('base64')]
};
await writeFile(new URL('../data/madison.js', import.meta.url), 'window.MADISON = ' + JSON.stringify(map) + ';\n');
console.log({
  buildings: houses.length, mappedHeights: houses.filter(h=>h[3]).length,
  roads: roads.length, parks: parks.length, water: water.length, trees: trees.length,
  lots:lots.length, brtStations: brtStations.length, trafficSignals: trafficSignals.length,
  terrainRange: [Math.min(...elevations)/16+255, Math.max(...elevations)/16+255],
  osm: Boolean(osm)
});
