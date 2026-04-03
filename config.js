// Конфигурация для разных городов
const CITY_CONFIG = {
  spb: {
    name: 'Санкт-Петербург',
    // ID Google таблицы для СПб
    sheetId: '1Q7uWL-Dbr1w6szky-ATmDa6yPofzGclbP8aAIYIdYWU',
    // URL Google Apps Script для СПб
    appsScriptUrl: process.env.GOOGLE_APPS_SCRIPT_URL_SPB || 'https://script.google.com/macros/s/YOUR_SPB_GOOGLE_APPS_SCRIPT/exec'
  },
  msk: {
    name: 'Москва',
    // ID Google таблицы для Москвы
    sheetId: '1Ndau1ncow3t5NnYhEGygTPjb2xGziGkCXrWdaf5a5o8',
    // URL Google Apps Script для Москвы
    appsScriptUrl: process.env.GOOGLE_APPS_SCRIPT_URL_MSK || 'https://script.google.com/macros/s/YOUR_MSK_GOOGLE_APPS_SCRIPT/exec'
  }
};

module.exports = CITY_CONFIG;
