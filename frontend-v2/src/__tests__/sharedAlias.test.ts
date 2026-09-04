/**
 * Guard: the four definitions of the `@shared` alias agree (QF-01).
 *
 * `shared/` is the only place code can live that BOTH apps read. Reaching it
 * takes an alias, and the alias is declared four separate times, in four
 * formats, none of which can see the other three:
 *
 *   frontend-v2/metro.config.js   a resolveRequest hook   (the mobile bundle)
 *   frontend-v2/tsconfig.json     a paths entry           (tsc only)
 *   frontend-v2/jest.config.js    a moduleNameMapper      (the mobile tests)
 *   frontend/vite.config.js       a resolve.alias         (the web app)
 *   frontend/vitest.config.mjs    a resolve.alias again   (the web tests)
 *
 * That last one is the proof this test earns its keep: it was written checking
 * four files, and the fifth was found hours later by a web test that failed to
 * resolve the alias. vitest does NOT read vite.config.js here -- it has its own
 * config with its own copy of the alias list.
 *
 * Each covers a different surface, so a missing one does not fail everywhere --
 * it fails in exactly one place. Drop the metro hook and tsc, jest and the web
 * build all stay green while the mobile bundle fails to resolve the import at
 * RUNTIME, which for a release build means an OTA that crashes on launch.
 *
 * Metro's hook cannot be replaced with the obvious `extraNodeModules` entry:
 * Metro parses "@shared/pillars" as a scoped package (@scope/pkg) and looks up
 * the key "@shared/pillars" rather than "@shared", so the alias never matches.
 * If someone "simplifies" it back, this test explains why not.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const V2 = join(__dirname, '..', '..');
const REPO = join(V2, '..');

const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

describe('the @shared alias', () => {
  it('resolves to a folder that exists and holds shared code', () => {
    const sharedRoot = join(REPO, 'shared');
    if (!existsSync(sharedRoot)) {
      throw new Error(`shared/ is missing at ${sharedRoot}; every alias below points at nothing.`);
    }
    if (!existsSync(join(sharedRoot, 'legal', 'types.ts'))) {
      throw new Error('shared/legal/types.ts is gone — the alias resolves to an empty folder.');
    }
  });

  it('is declared in metro.config.js as a resolveRequest prefix hook', () => {
    const src = read('frontend-v2/metro.config.js');
    if (!src.includes("const ALIAS_PREFIX = '@shared/';")) {
      throw new Error(
        'metro.config.js no longer maps @shared/. The mobile bundle resolves imports ' +
        'through this hook and nothing else — tsc, jest and the web build will all ' +
        'stay green while the app fails to resolve the module at runtime.');
    }
    if (!src.includes('resolveRequest')) {
      throw new Error(
        'metro.config.js dropped the resolveRequest hook. extraNodeModules does not ' +
        'work for this: Metro reads "@shared/x" as a scoped package name and looks up ' +
        'the wrong key, so the alias silently never matches.');
    }
  });

  it('is declared in tsconfig.json paths', () => {
    const tsconfig = read('frontend-v2/tsconfig.json');
    if (!tsconfig.includes('"@shared/*"') || !tsconfig.includes('"../shared/*"')) {
      throw new Error('frontend-v2/tsconfig.json lost the @shared/* -> ../shared/* path. tsc will report every shared import as missing.');
    }
  });

  it('is declared in jest.config.js moduleNameMapper', () => {
    const jestConfig = read('frontend-v2/jest.config.js');
    if (!jestConfig.includes('@shared/(.*)') || !jestConfig.includes('../shared/$1')) {
      throw new Error('frontend-v2/jest.config.js lost the @shared mapping. Every mobile test touching shared code fails to resolve it.');
    }
  });

  it("is declared in v1's vitest.config.mjs, which does NOT read vite.config.js", () => {
    const vitest = read('frontend/vitest.config.mjs');
    if (!vitest.includes("'@shared'")) {
      throw new Error(
        "frontend/vitest.config.mjs lost the '@shared' alias. vitest has its own " +
        'resolve.alias and ignores vite.config.js, so the web app builds and only ' +
        'its TESTS fail to resolve shared imports.');
    }
  });

  it("is declared in v1's vite.config.js", () => {
    const vite = read('frontend/vite.config.js');
    if (!vite.includes("'@shared'")) {
      throw new Error("frontend/vite.config.js lost the '@shared' alias. The web build breaks, but only the web build.");
    }
    if (!vite.includes("fs: { allow: ['..'] }")) {
      throw new Error(
        "vite's server.fs.allow no longer permits '..'. shared/ sits above the " +
        'frontend root, so the dev server refuses to serve it — production builds ' +
        'keep working, which makes this look like a dev-machine problem.');
    }
  });

  it('is actually importable end to end', () => {
    // Not a config string this time: jest resolves this through the mapping
    // under test, so a broken moduleNameMapper fails here rather than passing.
    const { privacyPolicy } = require('@shared/legal/privacyPolicy');
    if (!privacyPolicy || typeof privacyPolicy !== 'object') {
      throw new Error('@shared/legal/privacyPolicy did not resolve to the shared document.');
    }
  });

  it('has no @legal imports left anywhere', () => {
    // @legal was the narrow predecessor. Its four configs are gone, so an
    // import still spelling it resolves nowhere -- and would fail at bundle
    // time on mobile, not here, without this.
    const files = [
      'frontend/src/pages/PrivacyPolicy.jsx',
      'frontend/src/pages/TermsOfService.jsx',
      'frontend-v2/app/terms.tsx',
      'frontend-v2/app/privacy.tsx',
      'frontend-v2/src/components/legal/LegalDocument.tsx',
    ];
    for (const f of files) {
      if (/from ['"]@legal\//.test(read(f))) {
        throw new Error(`${f} still imports from @legal/, an alias no config defines any more.`);
      }
    }
  });
});
