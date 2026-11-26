const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * allowOptionalDependencies: cho phép require() trong try/catch tới gói chưa cài
 * (vd @react-native-firebase/messaging ở src/push.ts) mà không làm hỏng bundle.
 */
const config = {
  transformer: {
    allowOptionalDependencies: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
