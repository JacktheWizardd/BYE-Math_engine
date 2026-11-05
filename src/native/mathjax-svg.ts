// Types for the part of react-native-mathjax-svg we use. Its own typings only
// declare the default component; `texToSvg` is exported from index.js too.
import 'react-native-mathjax-svg';

declare module 'react-native-mathjax-svg' {
  /** TeX → SVG markup. Width/height come back in `ex`, multiplied by `scale`. */
  export function texToSvg(tex: string, scale?: number): string;
}
