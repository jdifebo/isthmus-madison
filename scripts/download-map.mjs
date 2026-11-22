import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const curl = promisify(execFile);
const cache = new URL('../.cache/', import.meta.url);
await mkdir(cache, { recursive: true });
const bounds = [-89.4095, 43.0644, -89.3585, 43.0882];
const city = 'https://maps.cityofmadison.com/arcgis/rest/services';
const open = city + '/Public/OPEN_DATA/MapServer';
const buildings = 'https://services1.arcgis.com/Ezk9fcjSUkeadg6u/ArcGIS/rest/services/3DMadison_3D_WFL1/FeatureServer/0';

async function download(name, url) {
  const path = new URL(name, cache);
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const { stdout } = await curl('curl.exe', [
    '-fLsS', '--max-time', '48', '-A', 'MadisonIsthmus/1.0 (offline GIS prototype)', url
  ], { maxBuffer: 32 * 1024 * 1024, encoding: 'buffer' });
  await writeFile(path, stdout);
  return stdout;
}

async function collection(name, layer, fields, bbox = bounds) {
  for (let offset = 0; ; offset += 1000) {
    const query = new URLSearchParams({
      f: 'geojson', where: '1=1', geometryType: 'esriGeometryEnvelope',
      geometry: bbox.join(','), inSR: '4326', outSR: '4326', geometryPrecision: '6',
      spatialRel: 'esriSpatialRelIntersects', outFields: fields,
      resultRecordCount: '1000', resultOffset: String(offset)
    });
    const page = JSON.parse(await download(`${name}-${offset}.json`, `${layer}/query?${query}`));
    if (!page.features) throw new Error(`${name}: ${JSON.stringify(page)}`);
    console.log(name, offset, page.features.length);
    if (!page.properties?.exceededTransferLimit && !page.exceededTransferLimit && page.features.length < 1000) return;
  }
}

async function streets() {
  const [w, s, e, n] = bounds;
  const box = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:27];(way["highway"](${box});way["building"]["height"](${box});way["building"]["building:levels"](${box}););out geom;`;
  for (const server of ['https://overpass.kumi.systems', 'https://overpass-api.de', 'https://overpass.private.coffee']) {
    try {
      const osm = JSON.parse(await download('osm-streets.json', `${server}/api/interpreter?${new URLSearchParams({data:query})}`));
      if (osm.elements?.length && !osm.remark) { console.log('OSM', osm.elements.length); return; }
      throw new Error(osm.remark || 'Empty response');
    } catch (error) {
      console.error(server, error.message.slice(0, 230));
    }
  }
  const nodes = new Map(), ways = new Map();
  for (let x=0; x<3; x++) {
    for (let y=0; y<2; y++) {
      const tile = [w+(e-w)*x/3, s+(n-s)*y/2, w+(e-w)*(x+1)/3, s+(n-s)*(y+1)/2];
      const response = await download('osm-tile-'+x+'-'+y+'.json',
        'https://api.openstreetmap.org/api/0.6/map.json?bbox='+tile.map(n=>n.toFixed(7)).join(','));
      const {elements} = JSON.parse(response);
      for (const element of elements) {
        if (element.type==='node') nodes.set(element.id,{lon:element.lon,lat:element.lat});
        const tags=element.tags || {};
        if (element.type==='way' && (tags.highway || tags.building && (tags.height || tags['building:levels']))) ways.set(element.id,element);
      }
      console.log('OpenStreetMap',x,y,elements.length);
    }
  }
  const elements=Array.from(ways.values(),way=>({
    id:way.id,tags:way.tags,geometry:way.nodes.map(id=>nodes.get(id))
  })).filter(way=>way.geometry.every(Boolean));
  await writeFile(new URL('osm-streets.json',cache),JSON.stringify({elements}));
}

const terrainZoom = 13;
const tile = 2 ** terrainZoom;
const tileX = lon => Math.floor((lon + 180) / 360 * tile);
const tileY = lat => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) * tile / 2);
const jobs = [
  collection('buildings', buildings, 'FID,Name,BuildingUs,BuildingCl'),
  collection('water', open + '/8', '*', [-89.44, 43.01, -89.30, 43.14]),
  collection('parks', open + '/24', '*'),
  collection('paths', open + '/36', '*'),
  collection('trees', open + '/0', 'OBJECTID'),
  collection('roads', city + '/MPO/Ped_Facilities/MapServer/14', '*'),
  streets(),
  download('three-license.txt', 'https://cdn.jsdelivr.net/npm/three@0.160.1/LICENSE')
    .then(data => writeFile(new URL('../assets/THREE-LICENSE.txt', import.meta.url), data))
];
for (let x = tileX(bounds[0]); x <= tileX(bounds[2]); x++) {
  for (let y = tileY(bounds[3]); y <= tileY(bounds[1]); y++) {
    jobs.push(download(`height-${x}-${y}.png`, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${terrainZoom}/${x}/${y}.png`)
      .then(data => console.log('Terrain', x, y, data.length)));
  }
}
const results = await Promise.allSettled(jobs);
for (const result of results) if (result.status === 'rejected') console.error(result.reason.message);
if (results.some(result => result.status === 'rejected')) process.exitCode = 1;
