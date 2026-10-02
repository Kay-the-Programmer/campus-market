import { describe, expect, it } from 'vitest';
import { compareByName, sortedByName } from './compareByName';

const names = (items: { name: string }[]) => items.map((i) => i.name);
const of = (...list: string[]) => list.map((name) => ({ name }));

describe('sortedByName', () => {
  it('puts categories in the order someone would look for them', () => {
    expect(names(sortedByName(of('Webcams', 'Audio', 'Laptop Locks', 'Cooling Pads'))))
      .toEqual(['Audio', 'Cooling Pads', 'Laptop Locks', 'Webcams']);
  });

  /* The one that plain string comparison gets wrong: "100W" lands before "65W"
     because it compares a character at a time, which is not what the person
     reading the list is doing. */
  it('reads numbers inside a name as numbers', () => {
    expect(names(sortedByName(of('100W Charger', '20W Charger', '65W Charger'))))
      .toEqual(['20W Charger', '65W Charger', '100W Charger']);
  });

  it('does not exile a lowercase first letter to one end', () => {
    expect(names(sortedByName(of('Tablets & iPads', 'iPhones', 'Android Phones'))))
      .toEqual(['Android Phones', 'iPhones', 'Tablets & iPads']);
  });

  it('leaves the caller’s array alone, because these are React state', () => {
    const original = of('Webcams', 'Audio');
    const sorted = sortedByName(original);
    expect(names(original)).toEqual(['Webcams', 'Audio']);
    expect(names(sorted)).toEqual(['Audio', 'Webcams']);
  });

  it('orders the cable names the seed script actually creates', () => {
    expect(names(sortedByName(of(
      'USB-C to USB-C Cable', 'Micro-USB Cable', 'USB-A to Lightning Cable',
    )))).toEqual(['Micro-USB Cable', 'USB-A to Lightning Cable', 'USB-C to USB-C Cable']);
  });

  it('is usable directly as a comparator', () => {
    expect(compareByName({ name: 'Audio' }, { name: 'Webcams' })).toBeLessThan(0);
    expect(compareByName({ name: 'Webcams' }, { name: 'Audio' })).toBeGreaterThan(0);
    expect(compareByName({ name: 'Audio' }, { name: 'Audio' })).toBe(0);
  });
});
