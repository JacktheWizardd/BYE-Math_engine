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

export const stage4: { title: string; figure: unknown }[] = [
  { title: 'Saddle z = x² − y² (drag to rotate)', figure: require('../examples/figures/23-saddle.json') },
  { title: 'Paraboloid over a disk, level curves', figure: require('../examples/figures/24-paraboloid-contours.json') },
  { title: 'Tangent plane', figure: require('../examples/figures/25-tangent-plane.json') },
  { title: 'Helix and tangent vector', figure: require('../examples/figures/26-helix.json') },
  { title: 'Plane x + y + z = 1', figure: require('../examples/figures/27-plane.json') },
  { title: 'Sphere (parametric surface)', figure: require('../examples/figures/28-sphere.json') },
  { title: 'Gradient vectors on a contour map', figure: require('../examples/figures/29-gradient-contours.json') },
  { title: 'Surface rising (animated)', figure: require('../examples/figures/30-surface-grows.json') },
];

export const stage3: { title: string; figure: unknown }[] = [
  { title: 'Number line: −1 < x ≤ 3', figure: require('../examples/figures/13-numberline-chain.json') },
  { title: 'Number line: x < 0 or x ≥ 2', figure: require('../examples/figures/14-numberline-union.json') },
  { title: 'Number line: x² − 4 > 0 (animated)', figure: require('../examples/figures/15-numberline-quadratic.json') },
  { title: 'Sign chart of a rational function', figure: require('../examples/figures/16-signchart-rational.json') },
  { title: 'First-derivative test (animated)', figure: require('../examples/figures/17-signchart-derivative.json') },
  { title: 'Bar chart (animated)', figure: require('../examples/figures/18-bar.json') },
  { title: 'Histogram', figure: require('../examples/figures/19-histogram.json') },
  { title: 'Box plot', figure: require('../examples/figures/20-box.json') },
  { title: 'Dot plot', figure: require('../examples/figures/21-dot.json') },
  { title: 'Scatter with line of best fit (animated)', figure: require('../examples/figures/22-scatter.json') },
  { title: 'Bar chart with long labels', figure: require('../examples/figures/31-bar-long-labels.json') },
  { title: 'Sign chart with 11 critical points', figure: require('../examples/figures/32-signchart-sin.json') },
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
  { title: 'Unknown figure kind', figure: require('../examples/bad/unknown-kind.json') },
  { title: 'Broken inequality', figure: require('../examples/bad/bad-inequality.json') },
  { title: '3D: tangent plane at a cusp', figure: require('../examples/bad/3d-tangent-cusp.json') },
  { title: '3D: plane outside the box', figure: require('../examples/bad/3d-plane-outside.json') },
];
