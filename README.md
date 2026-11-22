# Isthmus

Walk, drive, or fly through downtown Madison, Wisconsin. [Play on GitHub Pages](https://jdifebo.github.io/isthmus-madison/) or open the standalone `Isthmus.html` in a WebGL-enabled desktop browser.

## Controls

| Action | Input |
| --- | --- |
| Walk, fly, or steer | WASD or arrow keys |
| Look around on foot or in flight | Drag the scene |
| Ascend / descend | Space / C |
| Sprint or boost in flight | Shift |
| Brake in the car | Space |
| Walk / drive / fly | 1 / 2 / 3 |
| Take off / land | F |
| Open the map and jump to a landmark | M |
| Hide or restore the HUD | H |
| Return to your current starting point | R |
| Close a panel or return to the title screen | Esc |

The playable map covers about 4.1 by 2.6 km, from the downtown edge of the UW campus to the near east side. Take flight over Lake Monona or jump to a landmark from the field map. Flight keeps the camera clear of terrain and rooftops. Switching to a ground mode over open water returns you to your last ground position.

Public aerial photos cover the terrain and surrounding landscape. Procedural clouds, water, façade materials and swaying tree crowns respond to daylight, golden hour, and blue hour. Most building heights are estimated, and the Capitol and Monona Terrace have custom exteriors. The procedural atmosphere takes inspiration from [Abyssal Garden](https://github.com/Noniv/abyssal-garden).

Street trees vary in height and canopy shape using the City Forestry inventory. From ground level you can see layered leaves, grass, flowerbeds around Capitol Square, and textured pavement. The field map marks the Metro Rapid corridor and can take you to the Blair, Paterson, and Baldwin center platforms. Bus-lane markings, shelter details, and signal timing are simulated.

## Data and source

- [City of Madison open data](https://data-cityofmadison.opendata.arcgis.com/) and [Greater Madison MPO](https://www.cityofmadison.com/mpo/maps-data/data-resources) for parks, water, street trees and supplementary roads.
- [City Forestry street tree inventory](https://maps.cityofmadison.com/arcgis/rest/services/Public/OPEN_DATA/MapServer/0) for tree locations, species groups, and trunk diameters.
- [Greater Madison MPO transportation layers](https://maps.cityofmadison.com/arcgis/rest/services/MPO/RTP_PIM_Board/MapServer) and [Madison Metro bus-only lane guide](https://www.cityofmadison.com/metro/routes-schedules/bus-rapid-transit/bus-only-traffic-lanes) for the East Washington Avenue stations, lanes, and traffic signal locations.
- [Dane County, City of Madison and Ayres Associates](https://services1.arcgis.com/Ezk9fcjSUkeadg6u/ArcGIS/rest/services/3DMadison_3D_WFL1/FeatureServer/0) for building footprints.
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) for street and path centerlines and some building heights. The OpenStreetMap-derived data is available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). The processed geodata is in `data/madison.js`. The download and conversion scripts reproduce it.
- [Mapzen / AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) for elevation.
- [USGS / USDA NAIP](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip) for the downtown and regional aerial textures.
- [Wisconsin Department of Administration](https://doa.wi.gov/Pages/CapitolTours/Wisconsin-State-Capitol-Exterior.aspx) and [Monona Terrace](https://www.mononaterrace.com/about-us/) for landmark references.
- [Three.js](https://threejs.org/) for the WebGL renderer. Its license is included in `assets/THREE-LICENSE.txt` and in the standalone HTML.

Open `index.html` to use the individual source files, or run `node scripts/serve.mjs` for a local preview. Run `node scripts/package.mjs` after source changes to rebuild the standalone file. Refreshing the data requires network access. Run `node scripts/download-map.mjs` and `node scripts/build-map.mjs` before packaging. Downloads are cached in `.cache/`.
