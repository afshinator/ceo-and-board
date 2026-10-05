import { describe, expect, it } from 'vitest';

describe('project bootstrap', () => {
  it('loads the basic toolchain', () => {
    expect(typeof describe).toBe('function');
    expect(typeof expect).toBe('function');
    expect(typeof it).toBe('function');
  });
});
