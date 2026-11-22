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
| Board a bus or request a stop | E at a platform or onboard |
| Take off / land | F |
| Open the map and jump to a landmark | M |
| Hide or restore the HUD | H |
| Return to your current starting point | R |
| Close a panel or return to the title screen | Esc |

The playable map covers about 4.1 by 2.6 km, from the downtown edge of the UW campus to the near east side. Take flight over Lake Monona or jump to a landmark from the field map. Flight keeps the camera clear of terrain and rooftops. Switching to a ground mode over open water returns you to your last ground position.

Public aerial photos cover the terrain and surrounding landscape. Procedural clouds, water, façade materials and swaying tree crowns respond to daylight, golden hour, and blue hour. Most building heights are estimated, and the Capitol and Monona Terrace have custom exteriors. The procedural atmosphere takes inspiration from [Abyssal Garden](https://github.com/Noniv/abyssal-garden).

Street trees vary in height and canopy shape using the City Forestry inventory. From ground level you can see layered leaves, grass, flowerbeds around Capitol Square, and textured pavement. The field map marks the Metro Rapid corridor and can take you to the Blair, Paterson, and Baldwin center platforms. Bus-lane markings, shelter details, and signal timing are simulated.

Articulated Route A buses run both ways on East Washington Avenue and open their platform-side doors at stops. Cars use the general lanes and brake for traffic lights, queues, and the player. The field map tracks the simulated buses, which arrive more often than the real service. [City of Madison Metro Rapid and Route A](https://www.cityofmadison.com/metro/routes-schedules/route-a)

Open the game with `?stop=paterson` to start at the station. The same shortcut works for Blair and Baldwin. [Start at Paterson](https://jdifebo.github.io/isthmus-madison/?stop=paterson)

Choose **Ride Metro Rapid** at the title screen to start on Paterson's platform. Board when the doors open, drag to look around the cabin, and request a stop to step onto the next platform when the doors open. The playable ride ends at Baldwin eastbound and Blair westbound. [Start on the Paterson platform](https://jdifebo.github.io/isthmus-madison/?stop=paterson&platform=1)

The field map also jumps to Orton Park and Breese Stevens Field. Nearby homes use mapped footprints and parcel boundaries, with generated roof shapes, siding, windows, doors, porches, paths, driveways, and planting beds. The house styles draw from the [Third Lake Ridge district](https://www.cityofmadison.com/dpced/planning/historic-preservation/local-historic-districts/third-lake-ridge) and [Marquette Bungalows](https://www.cityofmadison.com/dpced/planning/historic-preservation/local-historic-districts/marquette-bungalows). Breese Stevens Field has a lined soccer pitch, stands, and a stone arcade inspired by its [historic grandstand](https://www.cityofmadison.com/parks/find-a-park/breese-stevens/history).

## Data and source

- [City of Madison open data](https://data-cityofmadison.opendata.arcgis.com/) and [Greater Madison MPO](https://www.cityofmadison.com/mpo/maps-data/data-resources) for parks, water, street trees and supplementary roads.
- [City Forestry street tree inventory](https://maps.cityofmadison.com/arcgis/rest/services/Public/OPEN_DATA/MapServer/0) for tree locations, species groups, and trunk diameters.
- [City of Madison parcel geometry](https://maps.cityofmadison.com/arcgis/rest/services/Public/OPEN_DATA2/MapServer/0) for house lot boundaries used to place paths and driveways.
- [Greater Madison MPO transportation layers](https://maps.cityofmadison.com/arcgis/rest/services/MPO/RTP_PIM_Board/MapServer) and [Madison Metro bus-only lane guide](https://www.cityofmadison.com/metro/routes-schedules/bus-rapid-transit/bus-only-traffic-lanes) for the East Washington Avenue stations, lanes, and traffic signal locations.
- [Dane County, City of Madison and Ayres Associates](https://services1.arcgis.com/Ezk9fcjSUkeadg6u/ArcGIS/rest/services/3DMadison_3D_WFL1/FeatureServer/0) for building footprints.
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) for street and path centerlines and some building heights. The OpenStreetMap-derived data is available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). The processed geodata is in `data/madison.js`. The download and conversion scripts reproduce it.
- [Mapzen / AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) for elevation.
- [USGS / USDA NAIP](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip) for the downtown and regional aerial textures.
- [Wisconsin Department of Administration](https://doa.wi.gov/Pages/CapitolTours/Wisconsin-State-Capitol-Exterior.aspx) and [Monona Terrace](https://www.mononaterrace.com/about-us/) for landmark references.
- [Three.js](https://threejs.org/) for the WebGL renderer. Its license is included in `assets/THREE-LICENSE.txt` and in the standalone HTML.

Open `index.html` to use the individual source files, or run `node scripts/serve.mjs` for a local preview. Run `node scripts/package.mjs` after source changes to rebuild the standalone file. Refreshing the data requires network access. Run `node scripts/download-map.mjs` and `node scripts/build-map.mjs` before packaging. Downloads are cached in `.cache/`.
