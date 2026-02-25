const { ipcMain } = require('electron');
const fs = require('fs');

// Google Gemini API ключ
const GEMINI_API_KEY = 'AIzaSyAttUx7Hv1NkGAKN-RdxwykEMaedjulpX0';

function setupOCRHandlers() {
  // Основной OCR через Google Gemini API
  ipcMain.handle('ocr-recognize', async (event, imagePath) => {
    try {
      event.sender.send('ocr-progress', { status: 'sending', progress: 0.2 });

      // Читаем изображение
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

      event.sender.send('ocr-progress', { status: 'processing', progress: 0.5 });

      // Вызов Gemini API
      const https = require('https');
      
      const response = await new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const dataBuffer = Buffer.from(data, 'utf8');
        
        const options = {
          hostname: 'generativelanguage.googleapis.com',
          port: 443,
          path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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

        req.on('error', reject);
        req.setTimeout(120000, () => req.destroy(new Error('Timeout')));
        req.write(dataBuffer);
        req.end();
      });

      event.sender.send('ocr-progress', { status: 'recognizing text', progress: 0.9 });

      const content = response.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!content) {
        throw new Error('No response from Gemini');
      }

      console.log('Gemini response:', content.substring(0, 300));

      // Парсим JSON из ответа
      let jsonMatch = null;
      
      // Очищаем от markdown
      content.replace('```json', '').replace('```', '').trim();
      
      // Ищем JSON
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
          // Пробуем добавить закрывающую скобку
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

    } catch (error) {
      console.error('OCR ошибка:', error);
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
