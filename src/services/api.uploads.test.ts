import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The frontend runs on Vercel and the API on its own host, so an image path
 * the API serves (`/api/uploads/x`) has to be made absolute before it reaches
 * an <img>, or the browser asks Vercel for it and gets index.html back.
 *
 * API_BASE_URL is read from the environment when the module loads, so each
 * test that needs a base sets the env first and imports fresh.
 */

const API = 'https://campusmarket.example.test';

async function load(base: string | undefined) {
  vi.resetModules();
  if (base === undefined) vi.stubEnv('VITE_API_BASE_URL', '');
  else vi.stubEnv('VITE_API_BASE_URL', base);
  return import('./api');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('absolutiseUploads', () => {
  it('makes an upload path absolute against the API base', async () => {
    const { absolutiseUploads } = await load(API);
    expect(absolutiseUploads('/api/uploads/a.jpg')).toBe(`${API}/api/uploads/a.jpg`);
  });

  it('reaches into nested objects and arrays - promos, threads, galleries', async () => {
    const { absolutiseUploads } = await load(API);
    const response = {
      promos: [{ id: 'p1', imageUrl: '/api/uploads/promo.webp' }],
      listing: { images: ['/api/uploads/1.jpg', '/api/uploads/2.jpg'] },
      thread: { peer: { avatarUrl: '/api/uploads/me.png' } },
    };
    expect(absolutiseUploads(response)).toEqual({
      promos: [{ id: 'p1', imageUrl: `${API}/api/uploads/promo.webp` }],
      listing: { images: [`${API}/api/uploads/1.jpg`, `${API}/api/uploads/2.jpg`] },
      thread: { peer: { avatarUrl: `${API}/api/uploads/me.png` } },
    });
  });

  it('leaves everything that is not an upload path alone', async () => {
    const { absolutiseUploads } = await load(API);
    const untouched = {
      external: 'https://lh3.googleusercontent.com/photo.jpg',
      dataUri: 'data:image/png;base64,AAAA',
      apiButNotUpload: '/api/listings/1',
      title: 'Not a URL at all',
      count: 3,
      flag: true,
      nothing: null,
    };
    expect(absolutiseUploads(untouched)).toEqual(untouched);
  });

  it('is a no-op when there is no API base, as in the all-in-one deployment', async () => {
    // Same origin serves app and API, so a relative path is already correct.
    const { absolutiseUploads } = await load(undefined);
    expect(absolutiseUploads('/api/uploads/a.jpg')).toBe('/api/uploads/a.jpg');
  });

  it('does not double-prefix a URL that is already absolute', async () => {
    const { absolutiseUploads } = await load(API);
    const already = `${API}/api/uploads/a.jpg`;
    expect(absolutiseUploads(already)).toBe(already);
  });
});
