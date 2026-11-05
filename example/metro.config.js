// Metro setup for developing the engine from the repo root without publishing it.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const engineRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the engine sources and example figures.
config.watchFolders = [engineRoot];
// `bye-math-engine/*` resolves to the repo root (its package.json "react-native" exports point at src/).
config.resolver.extraNodeModules = { 'bye-math-engine': engineRoot };
// Hide the engine's own node_modules (its dev copies of react, react-native-svg, …) so the
// engine sources resolve packages from the example's node_modules: one copy of each.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const engineModules = new RegExp(`^${escape(path.join(engineRoot, 'node_modules'))}[\\\\/]`);
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], engineModules);
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
