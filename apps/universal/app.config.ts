import type { ExpoConfig } from 'expo/config'
const config: ExpoConfig = {
  name: 'Monkey', slug: 'monkey', version: '0.3.0', scheme: 'monkey',
  orientation: 'default', userInterfaceStyle: 'light', icon: './assets/icon.png',
  ios: { supportsTablet: true, bundleIdentifier: 'com.monkey.agent', infoPlist: {
    NSLocalNetworkUsageDescription: '连接你局域网中的 Monkey 服务。',
    NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
  } },
  android: { package: 'com.monkey.agent', softwareKeyboardLayoutMode: 'resize', predictiveBackGestureEnabled: true },
  web: { bundler: 'metro', output: 'single', name: 'Monkey', favicon: './assets/icon.png' },
  plugins: [['expo-build-properties', { android: { usesCleartextTraffic: process.env.MONKEY_ALLOW_LAN_HTTP === '1' } }], 'expo-status-bar', 'expo-secure-store', ['expo-image-picker', { photosPermission: '选择图片发送给 Monkey。', cameraPermission: false, microphonePermission: false }]],
}
export default config
