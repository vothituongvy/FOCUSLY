// Copy file tĩnh (manifest, html, css, icons) vào dist/
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
cpSync('static', 'dist', { recursive: true });
console.log('✓ Extension build xong: thư mục dist/ (chrome://extensions → Load unpacked)');
