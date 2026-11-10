# BYE Math Engine — brief for planning and implementation

> Hand this file to Claude Code. Start in plan mode: read it fully, ask the open questions in §10, then propose a plan for **Stage 1 only**.

## 1. What this is

**BYE Math Engine** draws the graphs and figures for BYE Math, a step-by-step math learning app (calculus and algebra now, any kind of math later). The app is being rebuilt in **React Native**, in a new and separate repo or folder layout.

The engine takes a **figure description** (plain JSON, written by an AI as part of each problem) and draws it natively. Nothing in a figure is positioned by hand. Every pixel comes from the math. That fixes the old problem: hand-typed SVG coordinates came out slightly wrong and needed many fixes.

Graphs appear **only where they carry the idea** (an area under a curve, a problem about a graph). Most problems have none. The look is a calm digital textbook: thin lines, warm paper background, colors that mean something.

## 2. Ground rules

- **Our own code.** Mafs (MIT) and JSXGraph (MIT option of its LGPL/MIT dual license) are *references* for design. Write our own implementation. If a function is ever adapted from either:
  - add `// adapted from <project> (MIT), <path>`
  - list it in `THIRD_PARTY_NOTICES.md` with their license text
  - never take code under JSXGraph's LGPL option
- **Don't use their names** for our package or API. Credit line: "BYE Math Engine, inspired by Mafs and JSXGraph."
- **Native first.** Render with `react-native-svg` (MIT). No WebView in Stage 1.
- **Swappable.** Problems only describe figures, so another renderer (Skia, web SVG) or a third-party engine (Desmos, GeoGebra, both needing paid agreements for commercial use) can be added later as an adapter. Problems never change.
- **TypeScript, strict.** The math core has no React or rendering imports.

## 3. Architecture

```
figure description (JSON from the problem)
        │  validate (schema) → typed Figure
        ▼
math core            pure TS, unit-tested, no drawing
  · view box & transforms (math ⇄ pixels, y flipped)
  · adaptive sampling of y = f(x) (denser where it bends; split at gaps/asymptotes)
  · regions: area under/between curves → closed polygon from the same samples
  · solvers: roots, intersections, f(a), numeric area (for checks and labels)
  · dependency graph: elements defined from other elements (point on f at x=3)
        ▼
scene                list of primitives: path, polygon, line, circle, text, mathLabel
                     each styled by ROLE (f, F, bound, area, …), not raw color
        ▼
renderer             react-native-svg (Stage 1); others later, same scene
```

From **Mafs**: the declarative feel (figure = list of elements), one view box from which everything is computed, adaptive sampling, a small theme of variables.
From **JSXGraph**: elements that depend on other elements, a library of ready-made elements (area/integral, tangent, intersection, number line), later geometry and 3D projection.

Suggested layout (Claude Code to confirm):

```
packages/engine-core/      math core + scene builder (pure TS)
packages/engine-native/    <ByeFigure figure={…} /> on react-native-svg
packages/engine-spec/      JSON schema + TS types for the figure description
examples/                  figures used as tests and in a gallery screen
THIRD_PARTY_NOTICES.md
```

## 4. Figure description (v0)

```jsonc
{
  "kind": "plot2d",
  "view": { "x": [0, 4], "y": [0, 9] },          // math coordinates shown
  "grid": { "x": 1, "y": 2 },                    // optional grid spacing
  "axes": { "x": true, "y": true, "labels": true },   // labels: numbers on the axes, on by default
  "elements": [
    { "id": "f",    "type": "function", "y": "2*x + 1", "role": "f", "label": { "text": "f", "at": 3.7 } },
    { "id": "area", "type": "region", "under": "f", "from": 1, "to": 3, "role": "area",
      "label": { "text": "area = 10", "at": "center" } },
    { "type": "segment", "from": [1, 0], "to": [1, "f(1)"], "role": "bound", "label": { "text": "a", "at": "below" } },
    { "type": "segment", "from": [3, 0], "to": [3, "f(3)"], "role": "bound", "label": { "text": "b", "at": "below" } },
    { "type": "text", "at": [1.25, 0.6], "text": "3 tall", "role": "note" },
    { "type": "text", "at": [2.6, 0.6],  "text": "7 tall", "role": "note" }
  ],
  "describe": "Shaded area under f(x) = 2x + 1 from x = 1 to x = 3, equal to 10."
}
```

- Expressions are strings (`"2*x + 1"`, `"f(1)"`), parsed by a small safe expression parser. **No `eval`.** References to other element ids are allowed.
- `role` decides style; see §6.
- `describe` is required. It becomes the accessibility label.
- The schema is versioned (`"spec": 0`) so old problems keep working.

### Stage 1 element types

| type | fields | notes |
|---|---|---|
| `function` | `y` (expr in x), optional `domain` | adaptive sampling; split at non-finite values and jumps |
| `region` | `under` (fn id) or `between` [fn, fn], `from`, `to` | polygon built from the same samples as the curve, so edges match exactly |
| `point` | `at` [x, y], or `on` fn id + `x` | the y of `on` is computed |
| `segment` | `from`, `to` (coords may be exprs) | |
| `line` | `through` [p, q], or `point` + `slope` | clipped to the view |
| `text` | `at`, `text` | plain text |
| `mathLabel` | `at`, `tex` | see §8 |

Later stages add: `tangent`, `intersection`, `numberLine`, `signChart`, `chart` (stats), geometry (`circle`, `angle`, `polygon` constructions), `plot3d`.

## 5. Stage plan

1. **Static 2D (this task):** view, grid, axes, function, region, point, segment, line, text, basic math label. Renders the reference figure exactly.
2. **Dependencies and motion:** points on curves, tangents, intersections; animate a region filling in or a point moving when a step appears (honor reduced motion).
3. **More kinds:** number lines, sign charts, simple statistics charts.
4. **3D** for Calc III (projection approach like JSXGraph's 3D view), possibly a separate renderer.

## 6. Look (BYE design tokens, light theme)

| role | token | hex | use |
|---|---|---|---|
| background | ground | `#f6f3ec` | figure background (transparent by default) |
| grid | grid | `#ece6da` | 1px |
| axes | axis | `#8a8378` | 1px |
| `f` | ai | `#2f4b7c` | the function, 2.5px |
| `area` | ai @ 16% | `#2f4b7c` + opacity 0.16 | shaded region |
| `bound` | shu | `#b5462a` | bounds a, b and plugged-in values, 2.5px |
| `F` | matsu | `#2f6b4a` | antiderivative and what comes from it |
| `note` | ink2 | `#5a554d` | small explanatory text |
| text | ink | `#1e1c19` | |

Fonts: math labels in **STIX Two Text** (italic for variables), notes in **Zen Kaku Gothic New**. No drop shadows, no fills except regions, no legends: label things in place.

The theme is one object (`ByeTheme`) passed to the renderer, so dark mode later is a second object.

## 7. Phone layout

- The figure fills the content width (390pt phone → ~338pt at 26pt margins), with an aspect ratio set by the figure or defaulting to 16:9.
- Labels must stay inside the figure; nudge them away from curves and edges.
- Minimum text size 11pt. Lines stay crisp at any scale (no raster).

## 8. Math labels (decide in planning)

KaTeX doesn't run natively in React Native. Options to evaluate:
- **(a)** a native math view library
- **(b)** pre-render TeX to SVG paths at build time (MathJax → SVG), shipped with the problem
- **(c)** Stage 1 fallback: a tiny formatter for simple labels (italic letters, superscripts, = signs) using STIX text spans

Recommend (c) for Stage 1, behind a `MathLabel` interface, with (a) or (b) chosen before Stage 2.

## 9. Acceptance for Stage 1

- [ ] `<ByeFigure figure={reference} />` renders the §4 figure on iOS and Android, matching the BYE look.
- [ ] **Exactness tests** (math core, no device):
  - the line passes through pixel(1, 3) and pixel(3, 7) within 0.5px
  - the region polygon's top edge equals the curve's samples between 1 and 3
  - numeric area of the region = 10 ± 1e-6
  - point `on: f, x: 3` resolves to (3, 7)
- [ ] Curves with gaps: `1/x` on [-3, 3] and `tan(x)` draw no vertical line across the asymptote.
- [ ] Bad input (unknown element type, invalid expression, region bounds outside the view) gives a clear validation error, never a crash or a blank figure.
- [ ] Every figure exposes `describe` as its accessibility label.
- [ ] A gallery screen in `examples/` shows the reference figure plus 5 more: a parabola with roots marked, area between two curves, `1/x`, a tangent-like line through two points, a line by point and slope.
- [ ] `THIRD_PARTY_NOTICES.md` exists, even if empty.

## 10. Open questions to settle before building

1. Expo or bare React Native? Does the rebuild also ship to the web through Expo (react-native-web)?
2. Monorepo tool (pnpm workspaces, Turborepo, none)? Or does the engine live inside the app repo at first?
3. Which math label option (§8) for Stage 1?
4. Expression parser: write a small one (Stage 1 needs + − × ÷ ^, parentheses, x, a few functions, references to element ids), or use an existing MIT parser?
5. Do figures need touch in Stage 1 (pan, zoom, drag)? The current answer is no: static, textbook style.

## 11. Context, if useful

- BYE Math's problem format, design system and UX research live in the BYE Math project and its design-system artifact. The figure description here replaces the old fixed `graph.kind` values (`bounds`, `F-with-f`, `point-on-F`, `area`) with this open element list.
- The problem screen shows a figure only on the step it explains (for example the subtract step of ∫₁³(2x+1)dx shows the shaded area labelled "area = 10").
