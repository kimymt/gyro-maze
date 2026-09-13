import { readdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function walk(dir){const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${item.name}`;if(item.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const files=(await walk('dist')).filter(p=>!p.endsWith('/sw.js')&&!p.endsWith('/_headers')).sort();
const source=await readFile('src/sw.template.js','utf8');
const hash=createHash('sha256').update(source);for(const p of files)hash.update(await readFile(p));
const version=hash.digest('hex').slice(0,12);
await writeFile('dist/sw.js',source.replace('__CACHE_NAME__',JSON.stringify(`gyro-maze-${version}`)).replace('__ASSETS__',JSON.stringify(files.map(p=>'/'+p.slice(5)))));
console.log(`Offline cache ${version}: ${files.length} assets`);
