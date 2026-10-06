/**
 * Worklet check for gesture and animation callbacks (ticket 0c4fa428).
 *
 * Gesture callbacks (`Gesture.Tap().onEnd(...)`) and animation hooks
 * (`useAnimatedStyle(...)`) are compiled to worklets and run on the UI thread.
 * A local helper they call is NOT a worklet unless it says `'worklet';` itself,
 * and calling a plain JS closure on the UI thread throws "Object is not a
 * function". MediaModal's double-tap called `reset()` that way, so
 * double-tapping an already zoomed image crashed the app.
 *
 * The reanimated jest mock runs everything on the JS thread, so a render test
 * cannot see this crash. This test reads the source instead: for every file
 * that uses gestures or animated hooks, each locally declared function called
 * (directly or transitively) from a worklet callback must carry the directive.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../../..');
const SCAN_DIRS = ['src', 'app'];
const WORKLET_HOOKS = new Set([
  'useAnimatedStyle',
  'useAnimatedProps',
  'useDerivedValue',
  'useAnimatedReaction',
  'useFrameCallback',
]);

type FnNode = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;

function isFn(n: ts.Node | undefined): n is FnNode {
  return !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n));
}

function hasWorkletDirective(fn: FnNode): boolean {
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return false;
  const first = body.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'worklet'
  );
}

/** Does this call chain start at `Gesture.X()` and stay on the UI thread? */
function gestureChainInfo(expr: ts.Expression): { isGesture: boolean; onJs: boolean } {
  let onJs = false;
  let cur: ts.Expression = expr;
  while (true) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        if (ts.isIdentifier(callee.expression) && callee.expression.text === 'Gesture') {
          return { isGesture: true, onJs };
        }
        if (callee.name.text === 'runOnJS' && cur.arguments[0]?.kind === ts.SyntaxKind.TrueKeyword) {
          onJs = true;
        }
        cur = callee.expression;
        continue;
      }
    }
    return { isGesture: false, onJs };
  }
}

/** Every function body that reanimated runs as a worklet in this file. */
function workletCallbacks(sf: ts.SourceFile): FnNode[] {
  const out: FnNode[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const arg = n.arguments[0];
      if (ts.isIdentifier(callee) && WORKLET_HOOKS.has(callee.text) && isFn(arg)) {
        out.push(arg);
      }
      if (ts.isPropertyAccessExpression(callee) && /^on[A-Z]/.test(callee.name.text) && isFn(arg)) {
        const info = gestureChainInfo(callee.expression);
        if (info.isGesture && !info.onJs) out.push(arg);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Locally declared functions by name: `const f = () => {}` and `function f() {}`. */
function localFunctions(sf: ts.SourceFile): Map<string, FnNode> {
  const map = new Map<string, FnNode>();
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && isFn(n.initializer)) {
      map.set(n.name.text, n.initializer);
    }
    if (ts.isFunctionDeclaration(n) && n.name) {
      map.set(n.name.text, n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return map;
}

/** Names of local functions called from worklets that lack the directive. */
function findNonWorkletCalls(source: string, fileName = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const locals = localFunctions(sf);
  const bad = new Set<string>();
  const seen = new Set<FnNode>();
  const walk = (fn: FnNode) => {
    if (seen.has(fn)) return;
    seen.add(fn);
    const visit = (n: ts.Node) => {
      // A nested function is its own scope; only its calls matter if it is
      // itself called, which the identifier lookup below handles.
      if (n !== fn && isFn(n)) return;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const target = locals.get(n.expression.text);
        if (target) {
          if (!hasWorkletDirective(target)) bad.add(n.expression.text);
          walk(target);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(fn);
  };
  workletCallbacks(sf).forEach(walk);
  return [...bad].sort();
}

function sourceFiles(): string[] {
  const files: string[] = [];
  const walkDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walkDir(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  SCAN_DIRS.forEach((d) => walkDir(path.join(ROOT, d)));
  return files;
}

describe('worklet callbacks only call worklets (ticket 0c4fa428)', () => {
  it('flags the original MediaModal bug: reset() without a directive', () => {
    const buggy = `
      const reset = () => { scale.value = withTiming(1); };
      const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
        if (savedScale.value > 1) { reset(); }
      });
    `;
    expect(findNonWorkletCalls(buggy)).toEqual(['reset']);
  });

  it('accepts a helper that declares itself a worklet', () => {
    const fixed = `
      const reset = () => { 'worklet'; scale.value = withTiming(1); };
      const doubleTap = Gesture.Tap().onEnd(() => { reset(); });
    `;
    expect(findNonWorkletCalls(fixed)).toEqual([]);
  });

  it('follows helpers transitively and covers animated hooks', () => {
    const src = `
      const inner = () => 1;
      const outer = () => { 'worklet'; return inner(); };
      const style = useAnimatedStyle(() => ({ opacity: outer() }));
    `;
    expect(findNonWorkletCalls(src)).toEqual(['inner']);
  });

  it('ignores callbacks on a gesture that runs on the JS thread', () => {
    const src = `
      const jsOnly = () => {};
      const g = Gesture.Pan().runOnJS(true).onEnd(() => { jsOnly(); });
    `;
    expect(findNonWorkletCalls(src)).toEqual([]);
  });

  it('MediaModal has no non-worklet call from a gesture callback', () => {
    const file = path.join(ROOT, 'src/components/feed/MediaModal.tsx');
    expect(findNonWorkletCalls(fs.readFileSync(file, 'utf8'), file)).toEqual([]);
  });

  it('no file in the app calls a non-worklet from a gesture or animated hook', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, 'utf8');
      if (!/Gesture\.|useAnimated|useDerivedValue|useFrameCallback/.test(src)) continue;
      for (const name of findNonWorkletCalls(src, file)) {
        offenders.push(`${path.relative(ROOT, file)}: ${name}()`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
