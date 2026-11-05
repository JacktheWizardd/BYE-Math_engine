# Third-party notices

BYE Math Engine, inspired by Mafs and JSXGraph.

The engine's own code is original. Mafs (MIT) and JSXGraph (MIT option of its LGPL/MIT dual license) are design references only; no code is copied from them. If a function is ever adapted from either, it carries an `// adapted from <project> (MIT), <path>` comment and is listed below with that project's license text. Code under JSXGraph's LGPL option is never used.

## Runtime dependencies shipped with the engine

| package | version | license | used for |
|---|---|---|---|
| react-native-mathjax-svg | 0.9.9 | MIT | math labels (`mathLabel` elements): TeX → SVG string |
| MathJax (bundled inside react-native-mathjax-svg) | 3.1.4 | Apache-2.0 | TeX layout and glyph paths |
| zod | 4.x | MIT | figure description validation |

Peer dependencies supplied by the host app: react (MIT), react-native (MIT), react-native-svg (MIT).
Optional, only for 3D (`bye-math-engine/native3d`): three (MIT), including its `Line2` / `LineMaterial` / `LineGeometry` add-ons, and expo-gl (MIT).

## Build-time tools (not shipped)

| package | license | used for |
|---|---|---|
| peggy | MIT | generates the expression parser from `src/expr/grammar.peggy` (the generated parser is our own grammar's output) |

## Fonts (loaded by the host app, not bundled)

| font | license |
|---|---|
| STIX Two Text | SIL Open Font License 1.1 |
| Zen Kaku Gothic New | SIL Open Font License 1.1 |

## License texts

MIT and Apache-2.0 full texts are included with each package in `node_modules/<package>/`. The Apache-2.0 text for MathJax is at https://www.apache.org/licenses/LICENSE-2.0 and MathJax's notice at https://github.com/mathjax/MathJax-src.
