import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../',import.meta.url);
const read = path => readFile(new URL(path,root),'utf8');
let html = await read('index.html');
const css = await read('style.css');
html = html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>\n'+css+'\n</style>');
for(const path of ['assets/three.min.js','data/madison.js','world.js','game.js']) {
  const code = await read(path);
  const license = path.startsWith('assets/') ? '/*\n'+await read('assets/THREE-LICENSE.txt')+'\n*/\n' : '';
  html = html.replace('<script src="'+path+'"></script>',
    ()=>'<script>\n'+license+code.replace(/<\/script/gi,'<\\/script')+'\n</script>');
}
await writeFile(new URL('Isthmus.html',root),html);
console.log('Isthmus.html is ready ('+(Buffer.byteLength(html)/1e6).toFixed(2)+' MB).');
