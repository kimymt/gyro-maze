import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const baselineCommit='23944e638578cfa7891846f1c55c02ed8436eb22';
const temp=await mkdtemp(join(tmpdir(),'gyro-variety-'));
await mkdir(join(temp,'src'));
await writeFile(join(temp,'package.json'),'{"type":"module"}');
await symlink(join(root,'node_modules'),join(temp,'node_modules'),'dir');
await writeFile(join(temp,'src/levels.ts'),execFileSync('git',['show',`${baselineCommit}:src/levels.ts`],{cwd:root}));
const before=await import(pathToFileURL(join(temp,'src/levels.ts')));
const after=await import(pathToFileURL(join(root,'src/levels.ts')));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const preservedStages=[0,1,2].map(index=>({number:after.getLevel(index).number,
 fields:Object.fromEntries(['route','blocks','start','checkpoints','goal'].map(field=>{
  const oldHash=hash(before.getLevel(index)[field]),newHash=hash(after.getLevel(index)[field]);
  return [field,{oldHash,newHash,equal:oldHash===newHash}];
 }))}));
function distances(module){
 const samples=Array.from({length:7},(_,i)=>{const level=module.getLevel(i+3);return Array.from({length:64},(_,j)=>{
  const node=level.route.find(point=>point.distance>=level.routeLength*j/63)??level.route.at(-1);
  return node.position.map(value=>value/level.halfSize);
 });});
 const pairs=[];
 for(let a=0;a<7;a++)for(let b=a+1;b<7;b++){
  let minimum=Infinity;
  for(let rotation=0;rotation<4;rotation++){
   let sum=0;
   for(let i=0;i<64;i++){let [x,y,z]=samples[b][i];for(let r=0;r<rotation;r++)[x,z]=[z,-x];
    const p=samples[a][i];sum+=(p[0]-x)**2+(p[1]-y)**2+(p[2]-z)**2;}
   minimum=Math.min(minimum,Math.sqrt(sum/64));
  }
  pairs.push({stages:[a+4,b+4],normalizedRms:minimum});
 }
 return pairs;
}
const result={baselineCommit,preservedStages,method:'64 equal-distance samples per route; divide coordinates by halfSize; take minimum RMS over four quarter turns. This is a geometric regression measure, not a visual-quality score.',
 beforePairDistances:distances(before),afterPairDistances:distances(after),
 stages:after.levelDefinitions.map((definition,index)=>{const level=after.getLevel(index);return {number:level.number,id:level.id,label:level.difficulty,edge:level.halfSize*2,routeLength:level.routeLength,routeSamples:level.route.length,terrainBlocks:level.blocks.length};})};
await writeFile(join(root,'research/stage-variety-geometry-20260921.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({preserved:preservedStages.every(stage=>Object.values(stage.fields).every(field=>field.equal)),oldDistanceRange:[Math.min(...result.beforePairDistances.map(p=>p.normalizedRms)),Math.max(...result.beforePairDistances.map(p=>p.normalizedRms))],newMinimumDistance:Math.min(...result.afterPairDistances.map(p=>p.normalizedRms)),stages:result.stages}));
