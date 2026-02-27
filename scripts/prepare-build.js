const fs = require('fs');
const path = require('path');

// Копируем .env в папку build/resources перед сборкой
const sourceEnv = path.join(__dirname, '..', '.env');
const destEnv = path.join(__dirname, '..', 'build', '.env');

// Создаём папку build если не существует
const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Копируем .env если он существует
if (fs.existsSync(sourceEnv)) {
  fs.copyFileSync(sourceEnv, destEnv);
  console.log('✅ .env скопирован в build/');
} else {
  console.warn('⚠️ .env не найден! Создайте файл .env с ключами API');
}
