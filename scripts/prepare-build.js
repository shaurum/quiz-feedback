const fs = require('fs');
const path = require('path');

// Определяем какой .env файл использовать (по умолчанию .env)
const envFileName = process.argv[2] || '.env';
const sourceEnv = path.join(__dirname, '..', envFileName);
const destEnv = path.join(__dirname, '..', 'build', '.env');

// Создаём папку build если не существует
const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Копируем .env если он существует
if (fs.existsSync(sourceEnv)) {
  fs.copyFileSync(sourceEnv, destEnv);
  console.log(`✅ ${envFileName} скопирован в build/`);
} else {
  console.warn(`⚠️ ${envFileName} не найден! Создайте файл с ключами API`);
}
