const { getDefaultConfig } = require('expo/metro-config');

const appRoot = __dirname;
const upstream = require(getDefaultConfig(appRoot).transformer.babelTransformerPath);

module.exports = {
  transform({ options, ...input }) {
    return upstream.transform({
      ...input,
      options: { ...options, projectRoot: appRoot },
    });
  },
  getCacheKey(options) {
    return upstream.getCacheKey({ ...options, projectRoot: appRoot });
  },
};
