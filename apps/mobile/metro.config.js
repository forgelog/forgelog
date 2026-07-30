const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, '../..');

// Runtime sync validation consumes the shared phone/watch contract directly.
// Make the workspace the Metro project root so release bundles can consume the
// contract without duplicating it inside the mobile app.
config.projectRoot = workspaceRoot;
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.transformer.babelTransformerPath = path.resolve(__dirname, 'metro.transformer.js');

module.exports = config;
