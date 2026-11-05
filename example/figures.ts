// Figures shared with the engine's tests (../examples).
export const gallery: { title: string; figure: unknown }[] = [
  { title: 'Reference: area under f', figure: require('../examples/figures/01-reference-area.json') },
  { title: 'Parabola with roots marked', figure: require('../examples/figures/02-parabola-roots.json') },
  { title: 'Area between two curves', figure: require('../examples/figures/03-area-between.json') },
  { title: 'y = 1/x', figure: require('../examples/figures/04-reciprocal.json') },
  { title: 'Line through two points', figure: require('../examples/figures/05-line-two-points.json') },
  { title: 'Line by point and slope', figure: require('../examples/figures/06-point-slope.json') },
  { title: 'y = tan x', figure: require('../examples/figures/07-tan.json') },
];

export const stage2: { title: string; figure: unknown }[] = [
  { title: 'Animated: area under f', figure: require('../examples/figures/11-area-animated.json') },
  { title: 'Animated: point moves along f', figure: require('../examples/figures/12-point-moves.json') },
  { title: 'Tangent at a point', figure: require('../examples/figures/08-tangent.json') },
  { title: 'Intersections and point references', figure: require('../examples/figures/09-intersection.json') },
  { title: "f and its derivative f'", figure: require('../examples/figures/10-derivative.json') },
];

export const badInputs: { title: string; figure: unknown }[] = [
  { title: 'Unknown element type', figure: require('../examples/bad/unknown-type.json') },
  { title: 'Invalid expression', figure: require('../examples/bad/invalid-expression.json') },
  { title: 'Region outside the view', figure: require('../examples/bad/region-outside-view.json') },
  { title: 'Tangent where there is none', figure: require('../examples/bad/tangent-no-derivative.json') },
  { title: 'Points defined from each other', figure: require('../examples/bad/point-cycle.json') },
];
