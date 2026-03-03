const { ipcMain } = require('electron');
const fs = require('fs');
const https = require('https');

// Google Gemini API ключ из .env
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('⚠️ GEMINI_API_KEY не найден в .env файле');
}

/**
 * Распознавание через Google Gemini
 */
async function recognizeWithGemini(imagePath, event, model = 'gemini-2.5-flash') {
  if (event) {
    event.sender.send('ocr-progress', { status: 'sending', progress: 0.2 });
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const prompt = 'Распознай анкету "Квиз, плиз!". Верни JSON:\n{"team_name":"...","comment":"...","ratings":{"difficulty":N,"questions_like":N,"organization":N,"host":N,"bar":N,"overall":N}}\nТолько JSON, без markdown.';

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096
    }
  };

  if (event) {
    event.sender.send('ocr-progress', { status: 'processing', progress: 0.5 });
  }

  const response = await new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const dataBuffer = Buffer.from(data, 'utf8');

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': dataBuffer.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (res.statusCode !== 200) {
            reject(new Error(result.error?.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(new Error('Failed to parse response'));
        }
      });
    });

    req.on('error', (err) => {
      // Проверка на ошибку подключения к интернету
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') {
        reject(new Error('🌐 Нет подключения к интернету\n\nПроверьте соединение и попробуйте снова ☕'));
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        reject(new Error('🌐 Превышено время ожидания ответа от сервера\n\nПроверьте подключение к интернету ☕'));
      } else {
        reject(err);
      }
    });
    req.setTimeout(120000, () => req.destroy(new Error('🌐 Превышено время ожидания ответа от сервера\n\nПроверьте подключение к интернету ☕')));
    req.write(dataBuffer);
    req.end();
  });

  if (event) {
    event.sender.send('ocr-progress', { status: 'recognizing text', progress: 0.9 });
  }

  const content = response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('No response from Gemini');
  }

  console.log('Gemini response:', content.substring(0, 300));

  // Парсим JSON из ответа
  let jsonMatch = null;
  const jsonPattern = /\{[\s\S]*\}/;
  const match = content.match(jsonPattern);

  if (match) {
    jsonMatch = match[0].trim();
  }

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch);
      return {
        success: true,
        team_name: parsed.team_name || '',
        comment: parsed.comment || '',
        ratings: parsed.ratings || {},
        method: 'gemini'
      };
    } catch (e) {
      if (!jsonMatch.endsWith('}')) {
        jsonMatch = jsonMatch + '}';
        try {
          const parsed = JSON.parse(jsonMatch);
          return {
            success: true,
            team_name: parsed.team_name || '',
            comment: parsed.comment || '',
            ratings: parsed.ratings || {},
            method: 'gemini'
          };
        } catch (e2) {
          throw new Error('Invalid JSON from Gemini');
        }
      }
      throw new Error('Invalid JSON from Gemini');
    }
  } else {
    throw new Error('No JSON found in response');
  }
}

function setupOCRHandlers() {
  // OCR через Google Gemini API
  ipcMain.handle('ocr-gemini', async (event, imagePath, model = 'gemini-2.5-flash') => {
    try {
      return await recognizeWithGemini(imagePath, event, model);
    } catch (error) {
      console.error('Gemini OCR ошибка:', error);

      // Проверка на ошибку геолокации
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes('user location is not supported') ||
          errorMessage.includes('location is not supported')) {
        return {
          success: false,
          error: '🌴 User location is not supported for the API use.\n\n🏖️ Едь в тёплые страны или включи VPN!\n\n✈️ А пока можно отдохнуть и выпить кофе ☕',
          team_name: '',
          comment: '',
          ratings: {}
        };
      }

      // Проверка на отсутствие подключения к интернету
      if (errorMessage.includes('enotfound') ||
          errorMessage.includes('getaddrinfo') ||
          errorMessage.includes('network') ||
          errorMessage.includes('econnrefused') ||
          errorMessage.includes('timeout')) {
        return {
          success: false,
          error: '🌐 Нет подключения к интернету\n\nПроверьте соединение и попробуйте снова ☕',
          team_name: '',
          comment: '',
          ratings: {}
        };
      }

      return {
        success: false,
        error: error.message,
        team_name: '',
        comment: '',
        ratings: {}
      };
    }
  });

  // Универсальный обработчик
  ipcMain.handle('ocr-recognize', async (event, imagePath, model = 'gemini-2.5-flash') => {
    try {
      return await recognizeWithGemini(imagePath, event, model);
    } catch (error) {
      console.error('OCR ошибка:', error);

      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes('user location is not supported') ||
          errorMessage.includes('location is not supported')) {
        return {
          success: false,
          error: '🌴 User location is not supported for the API use.\n\n🏖️ Едь в тёплые страны или включи VPN!\n\n✈️ А пока можно отдохнуть и выпить кофе ☕',
          team_name: '',
          comment: '',
          ratings: {}
        };
      }

      return {
        success: false,
        error: error.message,
        team_name: '',
        comment: '',
        ratings: {}
      };
    }
  });
}

module.exports = { setupOCRHandlers };
