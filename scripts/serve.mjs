import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.jpg':'image/jpeg' };
const paths = new Set(['/index.html', '/Isthmus.html', '/style.css', '/atmosphere.js', '/homes.js', '/places.js', '/landscape.js',
  '/streetscape.js', '/traffic.js', '/pedestrians.js', '/world.js', '/game.js',
  '/data/madison.js', '/assets/three.min.js', '/assets/madison-aerial.jpg', '/assets/madison-region.jpg']);
const port = Number(process.argv[2] || 4173);
createServer(async (req,res)=>{
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname==='/'?'/index.html':pathname;
  if (!paths.has(file)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(new URL('.'+file,root));
    res.writeHead(200, {'Content-Type':types[file.slice(file.lastIndexOf('.'))]}).end(data);
  } catch {
    res.writeHead(500).end();
  }
}).listen(port,'127.0.0.1',()=>console.log('Isthmus is available at http://127.0.0.1:'+port));
