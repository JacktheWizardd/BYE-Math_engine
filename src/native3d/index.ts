// 3D figures (plot3d). Needs the optional peer dependencies `three` and `expo-gl`.
// Importing this entry also lets plain <ByeFigure> draw plot3d figures.
import { registerFigureRenderer } from '../native/ByeFigure.tsx';
import { ByeFigure3D } from './ByeFigure3D.tsx';

registerFigureRenderer('plot3d', ByeFigure3D);

export { ByeFigure3D };
export { createGLScene, type GLScene } from './glRenderer.ts';
export { figureToScene3d, overlay3d, timeline3d, type Scene3D } from '../core/index.ts';
