# Isthmus

An offline 3D exploration game of downtown Madison, Wisconsin. Open `Isthmus.html` in a desktop browser with WebGL enabled. Everything the game needs is inside that file.

## Controls

| Action | Input |
| --- | --- |
| Walk, accelerate, reverse or steer | WASD or arrow keys |
| Look around on foot | Drag the scene |
| Sprint on foot / brake in the car | Shift / Space |
| Switch between walking and driving | E |
| Open the map and jump to a landmark | M |
| Return to your current starting point | R |
| Close a panel or return to the title screen | Esc |

The map covers about 4.1 by 2.6 km, from the downtown edge of the UW campus to the near east side. The elevation, street and path alignments, shorelines and building footprints come from public geodata. Most building heights are estimated. Materials, interiors, traffic, lane markings and street furniture are simplified or omitted. The Capitol and Monona Terrace use custom exterior geometry.

## Data and source

- [City of Madison open data](https://data-cityofmadison.opendata.arcgis.com/) and [Greater Madison MPO](https://www.cityofmadison.com/mpo/maps-data/data-resources) for parks, water, street trees and supplementary roads.
- [Dane County, City of Madison and Ayres Associates](https://services1.arcgis.com/Ezk9fcjSUkeadg6u/ArcGIS/rest/services/3DMadison_3D_WFL1/FeatureServer/0) for building footprints.
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) for street and path centerlines and some building heights. The OpenStreetMap-derived data is available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). The processed geodata is in `data/madison.js`. The download and conversion scripts reproduce it.
- [Mapzen / AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) for elevation.
- [Wisconsin Department of Administration](https://doa.wi.gov/Pages/CapitolTours/Wisconsin-State-Capitol-Exterior.aspx) and [Monona Terrace](https://www.mononaterrace.com/about-us/) for landmark references.
- [Three.js](https://threejs.org/) for the WebGL renderer. Its license is included in `assets/THREE-LICENSE.txt` and in the standalone HTML.

Open `index.html` to use the individual source files, or run `node scripts/serve.mjs` for a local preview. Run `node scripts/package.mjs` after source changes to rebuild the standalone file. Refreshing the data requires network access. Run `node scripts/download-map.mjs` and `node scripts/build-map.mjs` before packaging. Downloads are cached in `.cache/`.
