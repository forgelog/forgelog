const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Runtime sync validation consumes the shared phone/watch contract directly.
// Metro only watches the app directory by default, so expose the workspace root
// without duplicating the contract inside the mobile app.
config.watchFolders = [path.resolve(__dirname, '../..')];

module.exports = config;
