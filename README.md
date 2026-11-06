# BYE Math Engine

Draws the graphs and figures for BYE Math from a plain-JSON **figure description**. Nothing is positioned by hand: every pixel comes from the math. Renders natively with `react-native-svg` (no WebView).

BYE Math Engine, inspired by Mafs and JSXGraph. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Design brief: [BYE_MATH_ENGINE.md](BYE_MATH_ENGINE.md).

## Use it in an app

```bash
npm install bye-math-engine react-native-svg
```

```tsx
import { ByeFigure } from 'bye-math-engine/native';

<ByeFigure figure={problem.figure} />        // fills the container width, 16:9 by default
<ByeFigure figure={problem.figure} width={338} />
```

- Bad input never crashes and is never blank: `ByeFigure` shows a box with the figure's `describe` text (and, in development, the validation errors). Pass `onError` to log them.
- `describe` is the accessibility label.
- Animation: elements with `animate` play once when the figure appears. Props: `animate={false}` shows the final state, change `replayKey` to replay, `onAnimationEnd`, `reduceMotion` to override the system setting. With Reduce Motion on, the final state is shown immediately. No extra dependency (a `requestAnimationFrame` clock; pass `animationDriver` to use another).
- Fonts: the theme refers to `STIXTwoText_400Regular`, `STIXTwoText_400Regular_Italic` and `ZenKakuGothicNew_400Regular`. Load them in the host app (e.g. with `@expo-google-fonts/stix-two-text` and `@expo-google-fonts/zen-kaku-gothic-new`); without them the system font is used.

Entry points:

| import | contents | React? |
|---|---|---|
| `bye-math-engine/spec` | zod schema, TS types, `validateSpec`, `figureJsonSchema()` | no |
| `bye-math-engine/expr` | expression parser / compiler | no |
| `bye-math-engine/core` | `validateFigure`, `figureToScene`, `timeline`/`frameAt`, sampling, solvers, `solveInequality`, `analyzeSign`, statistics, theme | no |
| `bye-math-engine/native` | `<ByeFigure>`, `SceneSvg`, `MathLabel`, `rafDriver`, `useReducedMotion` | yes |
| `bye-math-engine/native3d` | `<ByeFigure3D>` for `plot3d` (three.js on expo-gl); importing it once lets `<ByeFigure>` draw 3D too | yes |

## Figure description (spec 0)

```jsonc
{
  "spec": 0,
  "kind": "plot2d",
  "view": { "x": [0, 4], "y": [0, 9] },
  "grid": { "x": 1, "y": 2 },
  "axes": { "x": true, "y": true, "labels": false },
  "elements": [
    { "id": "f", "type": "function", "y": "2x + 1", "label": { "text": "f", "at": 3.7 } },
    { "type": "region", "under": "f", "from": 1, "to": 3, "label": { "text": "area = 10", "at": "center" } },
    { "type": "segment", "from": [1, 0], "to": [1, "f(1)"], "role": "bound", "label": { "text": "a", "at": "below" } }
  ],
  "describe": "Shaded area under f(x) = 2x + 1 from x = 1 to x = 3, equal to 10."
}
```

| type | fields |
|---|---|
| `function` | `y` (expression in x), optional `domain` |
| `region` | `under` (function id) or `between` [id, id], `from`, `to` |
| `point` | `at` [x, y], or `on` (function id) + `x` |
| `segment` | `from`, `to` |
| `line` | `through` [p, q], or `point` + `slope` |
| `tangent` | `to` (function id), `at` (x); optional `length` for a segment instead of a full line |
| `intersection` | `of` [id, id] (functions, lines, tangents) or [id] (meets the x-axis); `near` (x) or `index` picks one |
| `text` | `at`, `text` |
| `mathLabel` | `at`, `tex` |

Every element takes an optional `id`, `role` (`f`, `F`, `area`, `bound`, `note`, `text`), `label` (`text` or `tex`, plus `at`: an x value for curves/lines, or `center`, `above`, `below`, `left`, `right`, `start`, `end`) and `animate`. Coordinates may be numbers or expressions (`"f(1)"`, `"pi/2"`, `"P.x"`). Any position (`from`, `to`, `at`, `point`, `through`) may also be the id of a point or intersection: `"to": "B"`. Elements may refer to ones defined later; circular definitions are errors. Examples: [examples/figures](examples/figures).

Labels are placed clear of curves, lines, dots and each other where possible. A keyword placement (`below`) keeps its side, growing the padding if it would stick out; a hand-placed `text` moves a little, then farther, to find a clear spot. Labels that still cross something are listed in `scene.labelCollisions` (`{ key, strokes, labels, points }`), so content checks can fail on them.

`animate`: `true`, or `{ "kind", "duration" (ms, 700), "delay" (ms, 0), "from" }`. Default kind by element: `draw` (function, line, tangent, segment), `fill` (region, sweeps left to right), `move` (point with `on`, glides along the curve from `from`), `fade` (everything else). An element's label fades in when it finishes; a moving point's label rides along. Use `delay` to sequence steps.

### Other figure kinds

`"kind"` picks the figure type. Everything else (theme, labels, `animate`, validation, error box, `ByeFigure`) works the same.

**Number line** — `{ "kind": "numberLine", "range": [-4, 5], "ticks"?, "tickLabels"?, "variable"?: "x", "elements": [...] }`

| type | fields |
|---|---|
| `inequality` | `expr`: `"-1 < x <= 3"`, `"x < 0 or x >= 2"`, `"x^2 - 4 > 0"`, `"(x-1)/(x+2) >= 0"`, `"x != 1"`, `"x = 2"` (also `≤ ≥ ≠`, `and`) — solved exactly, drawn with open/filled dots and arrows where it runs off the line |
| `interval` | `from`, `to` (omit for unbounded), `closed`: [bool, bool] |
| `point` | `at`, `open` |
| `text` / `mathLabel` | `at`, `text` / `tex`, `side`: `above` \| `below` |

**Sign chart** — `{ "kind": "signChart", "f": "(x-1)(x+2)/(x-3)", "factors"?: ["x-1", "x+2", "x-3"] }`, or `"rows"` for full control: `{ "expr": "f'(x)", "show": "sign" | "trend", "label"?: tex }` with `"functions": { "f": "x^3 - 3x" }`. Zeros, undefined points and signs are computed; trend rows draw ↗/↘ and mark max/min. `"marks": [{ "x": "sqrt(2)", "tex": "\\sqrt{2}" }]` controls how a point is written; `"range"` limits the search (default ±50, up to 40 critical points). When the columns would be too narrow to read, the chart scrolls sideways with its headings pinned on the left. Simple multiples of π are written as such (−5π, π/2).

**Chart** — `{ "kind": "chart", "type": …, "title"?, "axes"?: { "x"?, "y"? }, "animate"? }`

| type | fields |
|---|---|
| `bar` | `bars`: [{ `label`, `value`, `role`? }], `max`? |
| `histogram` | `data` + `bins`: count, `{ width, start? }` or `{ edges }`; or ready-made `bins`: [{ `from`, `to`, `count` }]. Bins are [a, b), the last one closed |
| `box` | `groups`: [{ `label`?, `data` }], `quartiles`: `exclusive` (default) \| `inclusive`; outliers beyond 1.5·IQR |
| `dot` | `data`, `step`? |
| `scatter` | `points`: [[x, y], …], `fit`: `linear` (least squares, equation and r shown) |

**3D** — `{ "kind": "plot3d", "view": { "x", "y", "z" }, "camera"?: { "azimuth", "elevation", "zoom" }, "rotate"?: true, "equalAxes"?: false, "axes"?: { "labels", "box" } }`. Needs the optional peer dependencies `three` and `expo-gl` (both in Expo Go): `npx expo install expo-gl && npm install three`, then `import 'bye-math-engine/native3d'` once. Drag to rotate (a drag that starts on a rotatable figure rotates it instead of scrolling the page). `autoRotate` (prop: `true` or degrees per second) slowly turns the figure after its animation to show it can be rotated; it stops once the user drags, and never runs under Reduce Motion.

| type | fields |
|---|---|
| `surface` | `z` in x and y, `region`? (e.g. `"x^2 + y^2 <= 4"`, edges cut exactly), `mesh`? (cells per side, default 48, up to 200), `opacity`? — its id can be called `f(1, 2)`, with partials `f_x`, `f_y`, `f_xy`… |
| `paramSurface` | `x`, `y`, `z` in u and v, `u`, `v` ranges |
| `plane` | `equation` (`"x + y + z = 1"`) or `point` + `normal`; cut to the box |
| `tangentPlane` | `to` (surface id), `at`: [x0, y0], `size`? |
| `curve` | `x`, `y`, `z` in t, `t` range |
| `point` | `at`: [x, y, z], or `on` (surface id) + `over`: [x, y] |
| `vector` / `segment` | `from`, `to` or `components` (vector) |
| `contour` | `f` (expression in x, y, or a surface id), `levels` — drawn on the floor |

plot2d also has `contour` (level curves by marching squares; give it an id to use `g_x(a, b)` for gradients) and `vector` (an arrow).

### Expressions

- Operators `+ - * / ^`, parentheses; Unicode `− × ÷ · π` also accepted.
- `^` is right-associative; `-x^2` means `-(x^2)`.
- Implicit multiplication: `2x`, `3sin(x)`, `2(x+1)`, `(x+1)(x-1)`, `x sin(x)`, `2pi x`. It has the same precedence as `*`, so `1/2x` is `(1/2)·x`.
- `name(...)` is a call when `name` is a built-in or a function element id (`f(1)`); otherwise it's a product (`x(x+1)`).
- Derivatives of function elements: `f'(x)`, `f''(2)`. Computed symbolically (chain rule through other functions); numeric only where there is no symbolic rule (`min`, `max`).
- Point coordinates: `P.x`, `P.y` (and `P.z` in 3D) for a `point` or `intersection` with id `P`.
- Two-variable functions (3D surfaces, 2D contours with an id): `f(a, b)`, partials `f_x(a, b)`, `f_yy`, `f_xy`… — exact, with the chain rule.
- Functions: `sin cos tan sec csc cot asin acos atan (arcsin…) sinh cosh tanh sqrt cbrt abs exp ln log floor ceil round sign min max`; `log(x)` is base 10, `log(b, x)` base b. Constants `pi`, `e`.
- Unknown names are errors with a hint (`xy` → "Did you mean x*y?", `sinx` → "sin(x)").
- No `eval`: a Peggy grammar ([src/expr/grammar.peggy](src/expr/grammar.peggy)) builds an AST that is compiled to closures.

## Develop

```bash
npm install
npm test            # math core: exactness, gaps, validation, parser
npm run typecheck
npm run gen:parser  # after editing grammar.peggy
```

Gallery app: see [example/](example/) (`cd example && npm install && npx expo start`).

Shareable 3D page (one HTML file, opens by double-click, no server):

```bash
cd example && EXPO_PUBLIC_SHOWCASE=3d npx expo export -p web --output-dir /tmp/bye-dist
python3 scripts/pack-html.py /tmp/bye-dist ../docs/share/bye-math-engine-3d.html
```

Add `--font ZenKakuGothicNew_400Regular=<latin-subset>.ttf` to shrink it from ~7.5 MB to ~4.7 MB (subset with `pyftsubset`).
