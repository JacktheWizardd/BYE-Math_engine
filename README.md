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
- Fonts: the theme refers to `STIXTwoText_400Regular`, `STIXTwoText_400Regular_Italic` and `ZenKakuGothicNew_400Regular`. Load them in the host app (e.g. with `@expo-google-fonts/stix-two-text` and `@expo-google-fonts/zen-kaku-gothic-new`); without them the system font is used.

Entry points:

| import | contents | React? |
|---|---|---|
| `bye-math-engine/spec` | zod schema, TS types, `validateSpec`, `figureJsonSchema()` | no |
| `bye-math-engine/expr` | expression parser / compiler | no |
| `bye-math-engine/core` | `validateFigure`, `figureToScene`, sampling, solvers, theme | no |
| `bye-math-engine/native` | `<ByeFigure>`, `SceneSvg`, `MathLabel` | yes |

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
| `text` | `at`, `text` |
| `mathLabel` | `at`, `tex` |

Every element takes an optional `id`, `role` (`f`, `F`, `area`, `bound`, `note`, `text`) and `label` (`text` or `tex`, plus `at`: an x value for curves/lines, or `center`, `above`, `below`, `left`, `right`, `start`, `end`). Coordinates may be numbers or expressions (`"f(1)"`, `"pi/2"`). Examples: [examples/figures](examples/figures).

### Expressions

- Operators `+ - * / ^`, parentheses; Unicode `− × ÷ · π` also accepted.
- `^` is right-associative; `-x^2` means `-(x^2)`.
- Implicit multiplication: `2x`, `3sin(x)`, `2(x+1)`, `(x+1)(x-1)`, `x sin(x)`, `2pi x`. It has the same precedence as `*`, so `1/2x` is `(1/2)·x`.
- `name(...)` is a call when `name` is a built-in or a function element id (`f(1)`); otherwise it's a product (`x(x+1)`).
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
