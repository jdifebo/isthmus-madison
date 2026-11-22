import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript' };
const paths = new Set(['/index.html', '/Isthmus.html', '/style.css', '/world.js', '/game.js', '/data/madison.js', '/assets/three.min.js']);
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
    res.writeHead(200, {'Content-Type':types[file.slice(file.lastIndexOf('.'))]+'; charset=utf-8'}).end(data);
  } catch {
    res.writeHead(500).end();
  }
}).listen(port,'127.0.0.1',()=>console.log('Isthmus is available at http://127.0.0.1:'+port));
