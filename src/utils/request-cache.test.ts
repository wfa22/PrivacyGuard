import { describe, it, expect, beforeEach, vi } from 'vitest';
import { previewCache } from './request-cache';

describe('previewCache', () => {
  beforeEach(() => {
    previewCache.clear();
  });

  it('stores and retrieves cached blob urls', () => {
    previewCache.set('k1', 'blob:url1');

    expect(previewCache.get('k1')).toBe('blob:url1');
    expect(previewCache.has('k1')).toBe(true);
    expect(previewCache.size).toBe(1);
  });

  it('returns null for missing key', () => {
    expect(previewCache.get('missing')).toBeNull();
  });

  it('clears cache and revokes urls', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    previewCache.set('k1', 'blob:url1');
    previewCache.set('k2', 'blob:url2');

    previewCache.clear();

    expect(previewCache.size).toBe(0);
    expect(revokeSpy).toHaveBeenCalledWith('blob:url1');
    expect(revokeSpy).toHaveBeenCalledWith('blob:url2');
  });
});