const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];
config.resolver.extraNodeModules = {
  '@forgelog/contracts': path.resolve(workspaceRoot, 'data/contracts'),
};
module.exports = config;
