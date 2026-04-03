const fs = require('fs');
const path = require('path');

// Копируем .env.spb в build/.env
const sourceEnv = path.join(__dirname, '..', '.env.spb');
const destEnv = path.join(__dirname, '..', 'build', '.env');

const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

if (fs.existsSync(sourceEnv)) {
  fs.copyFileSync(sourceEnv, destEnv);
  console.log('✅ .env.spb скопирован в build/');
} else {
  console.warn('⚠️ .env.spb не найден!');
}

// Конфигурация для electron-builder
module.exports = {
  appId: 'com.quizfeedback.spb',
  productName: 'Обратная связь КП СПб',
  directories: {
    output: 'dist/spb'
  },
  files: [
    'main.js',
    'renderer.js',
    'ocr-handler.js',
    'yc-token.js',
    'config.js',
    'index.html',
    'logo.svg',
    'icon.icns',
    'scripts/**/*'
  ],
  asarUnpack: [
    '**/*.node'
  ],
  mac: {
    category: 'public.app-category.utilities',
    target: 'dmg',
    icon: 'icon.icns',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist'
  },
  extraResources: [
    'build/.env'
  ],
  extraFiles: [
    'INSTALL_INSTRUCTION.txt'
  ],
  dmg: {
    contents: [
      {
        x: 130,
        y: 220,
        type: 'file',
        path: 'INSTALL_INSTRUCTION.txt'
      }
    ]
  }
};
