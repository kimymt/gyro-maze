import {afterEach, expect, it, vi} from 'vitest';
import {CatmullRomCurve3} from 'three';

afterEach(() => vi.restoreAllMocks());

it('lists ten worlds without constructing routes and builds each requested world only once', async () => {
  vi.resetModules();
  const generateRoute = vi.spyOn(CatmullRomCurve3.prototype, 'updateArcLengths');
  const {levelDefinitions, getLevel, levels} = await import('../src/levels');
  expect(levelDefinitions).toHaveLength(10);
  expect(levels).toHaveLength(10);
  expect(generateRoute).not.toHaveBeenCalled();
  for (let index = 0; index < levelDefinitions.length; index++) {
    const definition = levelDefinitions[index];
    expect(definition.number).toBe(String(index + 1).padStart(2, '0'));
    expect(definition).not.toHaveProperty('route');
    expect(definition).not.toHaveProperty('blocks');
    expect(Object.getOwnPropertyDescriptor(levels, index)?.get).toBeTypeOf('function');
  }
  expect(new Set(levelDefinitions.map(level => level.id)).size).toBe(10);
  // Opening stage 10 directly must not build the preceding nine stages.
  const last = getLevel(9), calls = generateRoute.mock.calls.length;
  expect(calls).toBe(1);
  expect(last.id).toBe(levelDefinitions[9].id);
  expect(getLevel(9)).toBe(last);
  expect(levels[9]).toBe(last);
  expect(generateRoute).toHaveBeenCalledTimes(calls);
  expect(getLevel(0)).not.toBe(last);
  expect(generateRoute).toHaveBeenCalledTimes(calls + 1);
});

it('increases both world dimensions and playable route length on every stage', async () => {
  const {levelDefinitions, getLevel} = await import('../src/levels');
  let previousSize = 0, previousLength = 0;
  for (let index = 0; index < levelDefinitions.length; index++) {
    const level = getLevel(index);
    expect(level.halfSize, `world ${level.number} dimensions`).toBeGreaterThan(previousSize);
    expect(level.routeLength, `world ${level.number} playable route`).toBeGreaterThan(previousLength);
    expect(level.halfSize).toBe(levelDefinitions[index].halfSize);
    expect(level.route.some(node => Math.max(...node.position.map(Math.abs)) > level.halfSize)).toBe(true);
    expect(level.route.some(node => Math.max(...node.position.map(Math.abs)) < level.halfSize * .65)).toBe(true);
    previousSize = level.halfSize;
    previousLength = level.routeLength;
  }
});

it('loads records for all ten worlds while retaining the retired third-stage record', async () => {
  const {levelDefinitions} = await import('../src/levels');
  const {parseSave} = await import('../src/state');
  const records = Object.fromEntries(levelDefinitions.map((level, index) => [level.id, {time: 20 + index, falls: 0}]));
  records['water-wilderness'] = {time: 12, falls: 0};
  for(const level of levelDefinitions.slice(3)){
    expect(level.id).toMatch(/-v2$/);
    records[level.id.replace(/-v2$/,'')]={time:10,falls:0};
  }
  const saved = parseSave(JSON.stringify({version: 1, quality: 'low', records: {...records, 'unknown-course': {time: 2, falls: 0}}}));
  expect(saved.records).toEqual(records);
  expect(saved.quality).toBe('low');
});

it('gives stages 04-10 different routes even after removing scale and quarter turns',async()=>{
  const {getLevel}=await import('../src/levels');
  // Compare positions at equal fractions of travel, so size or a rotated clone
  // cannot masquerade as a different course. This complements visual review.
  const samples=Array.from({length:7},(_,i)=>{
    const level=getLevel(i+3);
    return Array.from({length:64},(_,j)=>{
      const distance=level.routeLength*j/63;
      const point=level.route.find(node=>node.distance>=distance)??level.route.at(-1)!;
      return point.position.map(value=>value/level.halfSize);
    });
  });
  for(let a=0;a<samples.length;a++)for(let b=a+1;b<samples.length;b++){
    let minimum=Infinity;
    for(let quarterTurn=0;quarterTurn<4;quarterTurn++){
      let squaredDistance=0;
      for(let i=0;i<64;i++){
        let [x,y,z]=samples[b][i];
        for(let turn=0;turn<quarterTurn;turn++)[x,z]=[z,-x];
        const p=samples[a][i];squaredDistance+=(p[0]-x)**2+(p[1]-y)**2+(p[2]-z)**2;
      }
      minimum=Math.min(minimum,Math.sqrt(squaredDistance/64));
    }
    expect(minimum,`stages ${a+4} and ${b+4} should not repeat the same route`).toBeGreaterThan(.5);
  }
});
