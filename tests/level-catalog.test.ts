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
  const saved = parseSave(JSON.stringify({version: 1, quality: 'low', records: {...records, 'unknown-course': {time: 2, falls: 0}}}));
  expect(saved.records).toEqual(records);
  expect(saved.quality).toBe('low');
});
