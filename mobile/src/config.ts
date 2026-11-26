import { Platform } from 'react-native';

/**
 * URL backend:
 *  - Android Emulator: http://10.0.2.2:4000 (trỏ về localhost của máy tính)
 *  - Điện thoại thật cùng Wi-Fi: http://<IP máy tính>:4000
 *  - Production (Render): https://focusly-api-ef5a.onrender.com
 */
const DEV_URL = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
const PROD_URL = 'https://focusly-api-ef5a.onrender.com';

export const API_URL = __DEV__ ? DEV_URL : PROD_URL;

/** OAuth Client ID loại "Web application" (dùng để lấy idToken trên Android) */
export const GOOGLE_WEB_CLIENT_ID = '';

/** Phiên bản app – giữ khớp với versionName trong android/app/build.gradle */
export const APP_VERSION = '1.0.0';
/** Repo GitHub chứa các bản APK (Releases). Repo phải để công khai để người dùng tải được. */
export const GITHUB_REPO = 'vothituongvy/FOCUSLY';

export const PLATFORM: 'android' | 'ios' = Platform.OS === 'ios' ? 'ios' : 'android';
