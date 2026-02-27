// Google Apps Script для обработки данных из приложения
// Разместите этот скрипт в Google Sheets: Расширения > Apps Script

const SHEET_ID = '1Q7uWL-Dbr1w6szky-ATmDa6yPofzGclbP8aAIYIdYWU';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Открываем таблицу
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getActiveSheet();

    // Проверяем заголовок
    const lastRow = sheet.getLastRow();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Если заголовок содержит "Дата/Время" - удаляем первый столбец
    if (headers[0] === 'Дата/Время' || headers[0] === 'Дата распознавания') {
      sheet.deleteColumn(1);
    }
    
    // Проверяем, есть ли правильный заголовок
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (currentHeaders[0] !== 'Название игры' || lastRow === 0) {
      // Очищаем и создаем правильный заголовок
      sheet.clear();
      sheet.appendRow([
        'Название игры',
        'Название команды',
        'Сложность вопросов',
        'Насколько понравились вопросы',
        'Организация игры',
        'Работа ведущего',
        'Обслуживание бара',
        'Общее впечатление',
        'Комментарий'
      ]);

      // Форматируем заголовок
      const headerRange = sheet.getRange(1, 1, 1, 9);
      headerRange.setBackground('#4285F4');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
    }

    // Добавляем новую строку
    sheet.appendRow([
      data.gameName || '',
      data.teamName || '',
      data.difficulty || 0,
      data.questionsLike || 0,
      data.organization || 0,
      data.host || 0,
      data.bar || 0,
      data.overall || 0,
      data.comment || ''
    ]);

    // Форматируем новую строку
    const newRow = sheet.getLastRow();
    const dataRange = sheet.getRange(newRow, 1, 1, 9);
    
    // Чередование цветов строк
    if (newRow % 2 === 0) {
      dataRange.setBackground('#F8F9FF');
    }
    
    // Центрируем оценки
    sheet.getRange(newRow, 5, 1, 7).setHorizontalAlignment('center');
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Ошибка: ' + error.toString());
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ 
      status: 'ready',
      message: 'Скрипт готов к работе'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
