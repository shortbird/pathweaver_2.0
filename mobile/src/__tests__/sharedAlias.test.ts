/**
 * Guard: the four definitions of the `@shared` alias agree (QF-01).
 *
 * `shared/` is the only place code can live that BOTH apps read. Reaching it
 * takes an alias, and the alias is declared four separate times, in four
 * formats, none of which can see the other three:
 *
 *   mobile/metro.config.js   a resolveRequest hook   (the mobile bundle)
 *   mobile/tsconfig.json     a paths entry           (tsc only)
 *   mobile/jest.config.js    a moduleNameMapper      (the mobile tests)
 *   web/vite.config.js       a resolve.alias         (the web app)
 *   web/vitest.config.mjs    a resolve.alias again   (the web tests)
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

const MOBILE = join(__dirname, '..', '..');
const REPO = join(MOBILE, '..');

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

  it('is a real npm workspace package', () => {
    // shared/ owns a package.json and the repo root lists it under
    // "workspaces", which is what lets it have scripts of its own -- the
    // pillar/subject code generator runs as `npm run generate`.
    const pkg = JSON.parse(read('shared/package.json'));
    if (pkg.name !== '@optio/shared') {
      throw new Error(`shared/package.json is named "${pkg.name}"; the root workspace entry expects @optio/shared.`);
    }
    if ('type' in pkg) {
      throw new Error(
        'shared/package.json declared a "type" field. Files under shared/ take their ' +
        'module type from the nearest package.json, which was the repo root\'s (none) ' +
        'before this file existed. Adding one reclassifies every .js under shared/.');
    }
    const root = JSON.parse(read('package.json'));
    if (!Array.isArray(root.workspaces) || !root.workspaces.includes('shared')) {
      throw new Error('the root package.json no longer lists "shared" in workspaces.');
    }
  });

  it('lets Metro resolve shared/ imports from the workspace root', () => {
    // shared/ has no node_modules. Without both search paths, a shared module
    // that imports anything resolves nowhere -- and only at bundle time.
    const src = read('mobile/metro.config.js');
    if (!src.includes('nodeModulesPaths')) {
      throw new Error(
        'metro.config.js dropped resolver.nodeModulesPaths. Metro walks node_modules ' +
        'directories rather than following Node resolution, so a package imported from ' +
        'shared/ is not found — at bundle time, not here.');
    }
  });

  it('is declared in metro.config.js as a resolveRequest prefix hook', () => {
    const src = read('mobile/metro.config.js');
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
    const tsconfig = read('mobile/tsconfig.json');
    if (!tsconfig.includes('"@shared/*"') || !tsconfig.includes('"../shared/*"')) {
      throw new Error('mobile/tsconfig.json lost the @shared/* -> ../shared/* path. tsc will report every shared import as missing.');
    }
  });

  it('is declared in jest.config.js moduleNameMapper', () => {
    const jestConfig = read('mobile/jest.config.js');
    if (!jestConfig.includes('@shared/(.*)') || !jestConfig.includes('../shared/$1')) {
      throw new Error('mobile/jest.config.js lost the @shared mapping. Every mobile test touching shared code fails to resolve it.');
    }
  });

  it("is declared in the web app's vitest.config.mjs, which does NOT read vite.config.js", () => {
    const vitest = read('web/vitest.config.mjs');
    if (!vitest.includes("'@shared'")) {
      throw new Error(
        "web/vitest.config.mjs lost the '@shared' alias. vitest has its own " +
        'resolve.alias and ignores vite.config.js, so the web app builds and only ' +
        'its TESTS fail to resolve shared imports.');
    }
  });

  it("is declared in the web app's vite.config.js", () => {
    const vite = read('web/vite.config.js');
    if (!vite.includes("'@shared'")) {
      throw new Error("web/vite.config.js lost the '@shared' alias. The web build breaks, but only the web build.");
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
      'web/src/pages/PrivacyPolicy.jsx',
      'web/src/pages/TermsOfService.jsx',
      'mobile/app/terms.tsx',
      'mobile/app/privacy.tsx',
      'mobile/src/components/legal/LegalDocument.tsx',
    ];
    for (const f of files) {
      if (/from ['"]@legal\//.test(read(f))) {
        throw new Error(`${f} still imports from @legal/, an alias no config defines any more.`);
      }
    }
  });
});
