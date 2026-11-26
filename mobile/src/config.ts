import { Platform } from 'react-native';

/**
 * URL backend:
 *  - Android Emulator: http://10.0.2.2:4000 (trỏ về localhost của máy tính)
 *  - Điện thoại thật cùng Wi-Fi: http://<IP máy tính>:4000
 *  - Production (Render): https://focusly-api.onrender.com
 */
const DEV_URL = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
const PROD_URL = 'https://focusly-api.onrender.com';

export const API_URL = __DEV__ ? DEV_URL : PROD_URL;

/** OAuth Client ID loại "Web application" (dùng để lấy idToken trên Android) */
export const GOOGLE_WEB_CLIENT_ID = '';

export const PLATFORM: 'android' | 'ios' = Platform.OS === 'ios' ? 'ios' : 'android';
