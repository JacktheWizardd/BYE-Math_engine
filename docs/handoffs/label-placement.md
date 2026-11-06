# Hand-off: label placement lets labels cross lines

From the BYE Math app bug hunt on 2026-11-05. Three bugs, filed as GitHub issues:

- [#1](https://github.com/JacktheWizardd/BYE-Math_engine/issues/1): a keyword placement (`at: 'below'`) is abandoned when it would overflow the canvas.
- [#2](https://github.com/JacktheWizardd/BYE-Math_engine/issues/2): the crossing cost counts sampled pieces, so straight lines are cheap to cross.
- [#3](https://github.com/JacktheWizardd/BYE-Math_engine/issues/3): there's no wider search and no warning when every candidate crosses a line.

## Goal

Labels in 2D figures don't sit across curves, segments or tangents when a clear spot exists nearby. When none exists, the scene says so, so the app's `npm run check:figures` can catch it.

## Where the cause is

All three live in `src/core/labels.ts` → `placeLabels`, and in how `src/core/scene.ts` builds the candidates.

1. **#1, overflow beats everything.** The cost is `overflow px × 1000` for every candidate, including `req.explicit` ones. The comment on `addLabel` says keyword placements keep their side and grow the padding, and the code after the choice does `grow(overflowOf(...))` for explicit labels. But the choice itself already avoided overflow at any price. In the reproduction, the below-left and below-right boxes of "c = 2: the answer" cross nothing yet cost about 12 000, so a box that crosses the curve 16 times wins (cost 2079).
2. **#2, the crossing cost depends on sampling.** `polylineHits(stroke, probe) × 120` counts the stroke pieces inside the box. One candidate gets 68 "hits" from the sampled curve `f`, while the straight secant or tangent gives at most 1. Count each stroke once per box, or use the clipped length in px, then re-tune the weights.
3. **#3, a small candidate set and silent failure.** `text` elements only get `nudges(c, w, h)` (a few px around `at`), and point labels only the 9 adjacent `boxBeside` boxes. When all of them cross something, the least-bad one is drawn and nothing is reported. Add a second ring further out, and return the labels that still cross something, e.g. `scene.labelCollisions`.

Fixing #2 alone doesn't fix the reproduction (tried: all nearby candidates still cross something). #1 and #3 do the real work.

## Reproduction

The §3.2 "How to spot it" figure at 323 px, with the label positions the app had before it worked around this:

```js
// node --import <BYE-Math_app>/scripts/ts-loader.mjs repro.mjs   (or put it in a vitest test)
import { figureToScene } from './src/core/index.ts';
const fig = {
  spec: 0, kind: 'plot2d', view: { x: [-1, 5], y: [-2.5, 10] }, grid: { x: 1, y: 2 },
  axes: { x: true, y: true, labels: false },
  elements: [
    { id: 'f', type: 'function', y: 'x^2 - 2x', domain: [0, 4], role: 'f', label: { text: 'f(x) = x² − 2x', at: 3.3 } },
    { type: 'point', at: [0, 0], role: 'bound' },
    { type: 'point', at: [4, 8], role: 'bound' },
    { type: 'segment', from: [0, 0], to: [4, 8], role: 'bound' },
    { type: 'text', at: [1.2, 3.8], text: 'average slope 2', role: 'bound' },
    { type: 'tangent', to: 'f', at: 2, length: 3, role: 'F' },
    { type: 'point', at: [2, 0], role: 'F', label: { text: 'c = 2: the answer', at: 'below' } },
  ],
  describe: 'repro',
};
const { scene } = figureToScene(fig, { width: 323 });
// Today: "average slope 2" crosses the secant (el-3); "c = 2: the answer" sits right of the
// point across the curve f and the tangent (el-5), not below.
```

To see every candidate's cost, log `req.key`, the candidate index, `cost` and `obstacles.strokes.map((s) => polylineHits(s, probe))` just after `cost += i * 2` in `placeLabels`.

## Done when

- In the reproduction, "c = 2: the answer" sits below the point (padding grows) and crosses nothing, and "average slope 2" crosses nothing.
- Unit tests cover: an explicit keyword label near the canvas edge keeps its side; a label next to a straight segment and one next to a curve are scored alike; a crowded label is reported in the scene result.
- `npx vitest run` passes, and existing example figures don't move labels for the worse (compare a few before and after).

## Then, in BYE-Math_app

- The app uses the engine straight from `../BYE-Math_engine` via Metro, so engine changes show up in the app at once. After the fix, run `npm run check:figures` and `npm run smoke:web` there, and look at a few Learn pages.
- If the scene reports collisions, make `scripts/check-figures.mjs` fail on them.
- The app hand-placed two labels to dodge this, on branch `claude/bug-hunt-65e102` (commit "Learn figures: move two labels off the lines"): §4.3 `learnCalc.ts` "f(x) = 2x + 1" (`at: 3.3` → `2.2`) and §3.2 `topics/calc32.ts` "average slope 2" (`[1.2, 3.8]` → `[1.2, 5.2]`). They can stay; just check they still look right.
