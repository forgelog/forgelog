const { withAppBuildGradle } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const RELEASE_SIGNING_CONFIG = `        release {
            def storeFilePath = System.getenv("FORGELOG_RELEASE_STORE_FILE")
            if (storeFilePath) {
                storeFile file(storeFilePath)
                storePassword System.getenv("FORGELOG_RELEASE_STORE_PASSWORD")
                keyAlias System.getenv("FORGELOG_RELEASE_KEY_ALIAS")
                keyPassword System.getenv("FORGELOG_RELEASE_KEY_PASSWORD")
            }
        }`;

const OLD_RELEASE_SIGNING_CONFIG_LINE = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const NEW_RELEASE_SIGNING_CONFIG_LINE = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig System.getenv("FORGELOG_RELEASE_STORE_FILE") ? signingConfigs.release : signingConfigs.debug`;

function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    contents = mergeContents({
      src: contents,
      newSrc: RELEASE_SIGNING_CONFIG,
      tag: 'forgelog-release-signing-config',
      anchor: /signingConfigs\s*\{/,
      offset: 1,
      comment: '//',
    }).contents;

    if (contents.includes(OLD_RELEASE_SIGNING_CONFIG_LINE)) {
      contents = contents.replace(OLD_RELEASE_SIGNING_CONFIG_LINE, NEW_RELEASE_SIGNING_CONFIG_LINE);
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidReleaseSigning;
