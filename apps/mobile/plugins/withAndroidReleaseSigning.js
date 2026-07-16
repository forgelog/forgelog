const { withAndroidManifest, withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');
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

const RELEASE_OPTIMIZATION_PROPERTIES = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  // Required by AGP 8.12 for its optimized resource shrinking pipeline.
  'android.r8.optimizedResourceShrinking': 'true',
  // Required for Gradle-managed device snapshots on GitHub's headless runners.
  'android.experimental.testOptions.managedDevices.emulator.gpu': 'swiftshader_indirect',
};

function withReleaseOptimizationProperties(config) {
  return withGradleProperties(config, (config) => {
    for (const [key, value] of Object.entries(RELEASE_OPTIMIZATION_PROPERTIES)) {
      const property = config.modResults.find(
        (item) => item.type === 'property' && item.key === key,
      );

      if (property) {
        property.value = value;
      } else {
        config.modResults.push({ type: 'property', key, value });
      }
    }

    return config;
  });
}

function withAndroidSecurityDefaults(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];

    if (application) {
      application.$['android:allowBackup'] = 'false';
      application.$['android:usesCleartextTraffic'] = 'false';
    }

    return config;
  });
}

function withAndroidReleaseSigning(config) {
  config = withReleaseOptimizationProperties(config);
  config = withAndroidSecurityDefaults(config);

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
