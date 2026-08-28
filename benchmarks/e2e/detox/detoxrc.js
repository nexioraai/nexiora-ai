/** Banc E2E — configuration Detox. Mêmes cibles que le banc P-003 :
 *  simulateur iPhone 17 Pro (UDID épinglé) et AVD bench_pixel, builds RELEASE. */
module.exports = {
  testRunner: { args: { $0: "jest", config: "e2e/jest.config.js" }, jest: { setupTimeout: 180000 } },
  apps: {
    "ios.release": {
      type: "ios.app",
      binaryPath: process.env.DETOX_IOS_APP || "ios/build/Build/Products/Release-iphonesimulator/e2ebench.app",
    },
    "android.release": {
      type: "android.apk",
      binaryPath: "android/app/build/outputs/apk/release/app-release.apk",
      testBinaryPath: "android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk",
    },
  },
  devices: {
    simulator: { type: "ios.simulator", device: { id: "68B8F6A8-F2BC-42BC-9B7E-9431ABC82F77" } },
    emulator: { type: "android.emulator", device: { avdName: "bench_pixel" } },
  },
  configurations: {
    "ios.release": { device: "simulator", app: "ios.release" },
    "android.release": { device: "emulator", app: "android.release" },
  },
};
