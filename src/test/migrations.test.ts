import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * A repo-hygiene check that lives in the frontend suite for the plain reason
 * that this is the test runner which actually runs here - the backend's tests
 * need a JDK, and the migrations need a database.
 *
 * It exists because of a real outage. Two branches each added a migration and
 * each picked the next free number they could see, so main ended up with two
 * V17 files. Flyway refuses to start at all when versions collide, so the API
 * container died on boot, nginx answered every request with a 502, and the
 * browser reported the lot as CORS failures - which sent the investigation
 * toward the allowlist, nowhere near the actual cause. Nothing about the
 * symptom pointed at the filename.
 *
 * The check costs nothing and fails in the one place where the fix is cheap:
 * before the merge, when renaming the file is all it takes.
 */

const MIGRATIONS = resolve(__dirname, '../../backend/src/main/resources/db/migration');

/** Flyway's naming scheme: V<version>__<description>.sql */
const FLYWAY_FILE = /^V(\d+(?:[._]\d+)*)__(.+)\.sql$/;

describe('Flyway migrations', () => {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'));

  it('has migrations to check', () => {
    // Guards the guard: a moved directory would otherwise make every
    // assertion below pass against an empty list.
    expect(files.length).toBeGreaterThan(0);
  });

  it('gives every migration a unique version', () => {
    const byVersion = new Map<string, string[]>();

    for (const file of files) {
      const version = FLYWAY_FILE.exec(file)?.[1];
      if (!version) continue;
      byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
    }

    const collisions = [...byVersion.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([version, names]) => `V${version}: ${names.join(', ')}`);

    expect(collisions, 'Flyway will refuse to start with these').toEqual([]);
  });

  it('names every migration the way Flyway expects', () => {
    // A file Flyway cannot parse is not a failure - it is silently skipped,
    // so the schema change simply never happens.
    const malformed = files.filter((file) => !FLYWAY_FILE.test(file));

    expect(malformed, 'these would be ignored rather than applied').toEqual([]);
  });
});
