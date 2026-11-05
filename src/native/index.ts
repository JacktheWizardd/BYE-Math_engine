export { ByeFigure, type ByeFigureProps } from './ByeFigure.tsx';
export { SceneSvg } from './renderScene.tsx';
export { MathLabel, mathJaxBackend, canRenderTex, type MathLabelBackend, type MathLabelProps } from './MathLabel.tsx';
export { FigureError, type FigureErrorProps } from './FigureError.tsx';
export { rafDriver, useReducedMotion, type AnimationDriver } from './animation.ts';
export { ByeLightTheme, figureToScene, frameAt, timeline, validateFigure, type ByeTheme, type Scene } from '../core/index.ts';
export { figureJsonSchema, validateSpec, type FigureInput, type Figure, type FigureIssue } from '../spec/index.ts';
