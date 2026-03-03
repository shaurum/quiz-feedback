#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCR сервис для распознавания форм обратной связи
Основной метод: Google Gemini API
Резервные методы: PaddleOCR, Ollama, EasyOCR
"""

import sys
import json
import os
import base64
import re

# Google Gemini API ключ
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', 'AIzaSyAttUx7Hv1NkGAKN-RdxwykEMaedjulpX0')

# Yandex Cloud API (опционально)
YANDEX_API_KEY = os.environ.get('YANDEX_API_KEY', '')
YANDEX_FOLDER_ID = os.environ.get('YANDEX_FOLDER_ID', '')

# GigaChat API (опционально)
GIGACHAT_CREDENTIALS = os.environ.get('GIGACHAT_CREDENTIALS', '')

# Ollama (резервный метод)
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'moondream')

def encode_image(image_path):
    """Кодирует изображение в base64"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def recognize_with_gemini(image_path):
    """Распознавание изображения через Google Gemini API"""
    try:
        import requests
        import urllib3

        base64_image = encode_image(image_path)

        prompt = """Ты - система распознавания анкет обратной связи "Квиз, плиз!".

ЗАДАЧА:
Внимательно изучи изображение и извлеки ВСЕ данные из анкеты.

ЧТО РАСПОЗНАТЬ:
1. **Название команды** - рукописный текст в поле "НАЗВАНИЕ КОМАНДЫ" (верхняя часть формы)
2. **Оценки** - цифры от 1 до 10 в кружочках по 6 категориям:
   - difficulty (Сложность вопросов)
   - questions_like (Насколько понравились вопросы)
   - organization (Организация игры)
   - host (Работа ведущего)
   - bar (Обслуживание бара)
   - overall (Общее впечатление)
3. **Комментарий** - рукописный текст в нижней части формы (после "поле для ваших бесценных комментариев")

ТРЕБОВАНИЯ:
- Распознавай РУССКИЙ рукописный текст внимательно
- Если текст плохо читается - старайся понять по контексту
- Оценки должны быть числами от 1 до 10
- Верни ПОЛНЫЙ JSON без сокращений и markdown

ФОРМАТ ОТВЕТА (только JSON, ничего больше):
{
  "team_name": "полное название команды",
  "comment": "полный текст комментария",
  "ratings": {
    "difficulty": 7,
    "questions_like": 4,
    "organization": 5,
    "host": 5,
    "bar": 9,
    "overall": 6
  }
}"""

        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": base64_image}}
                ]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 4096
            }
        }

        headers = {
            'Content-Type': 'application/json'
        }

        print("Отправка запроса к Google Gemini...", file=sys.stderr)

        response = requests.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}',
            headers=headers,
            json=payload,
            timeout=120
        )

        result = response.json()

        if response.status_code != 200:
            error_msg = result.get('error', {}).get('message', str(result))
            print(f"Gemini Error: {response.status_code} - {error_msg}", file=sys.stderr)
            raise Exception(f'Gemini Error {response.status_code}: {error_msg}')

        content = result['candidates'][0]['content']['parts'][0]['text']
        print(f"Full response: [{content}]", file=sys.stderr)

        # Очищаем ответ от markdown и лишнего текста
        json_match = None
        
        # Удаляем markdown блоки
        content = content.replace('```json', '').replace('```', '').strip()
        
        # Ищем JSON по паттерну - ищем до КОНЦА строки
        json_pattern = r'\{[\s\S]*\}'
        match = re.search(json_pattern, content)

        if match:
            json_match = match.group().strip()
            
            try:
                parsed = json.loads(json_match)
                return {
                    'success': True,
                    'team_name': parsed.get('team_name', ''),
                    'comment': parsed.get('comment', ''),
                    'ratings': parsed.get('ratings', {}),
                    'method': 'gemini'
                }
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}, raw: {json_match[:300]}", file=sys.stderr)
                # Пробуем добавить закрывающую скобку если её нет
                if not json_match.endswith('}'):
                    json_match = json_match + '}'
                    try:
                        parsed = json.loads(json_match)
                        return {
                            'success': True,
                            'team_name': parsed.get('team_name', ''),
                            'comment': parsed.get('comment', ''),
                            'ratings': parsed.get('ratings', {}),
                            'method': 'gemini'
                        }
                    except:
                        pass
                raise Exception(f'Invalid JSON: {e}')
        else:
            raise Exception('No JSON found in response')

    except ImportError as e:
        print(f"requests module not installed: {e}", file=sys.stderr)
        raise Exception('requests module not installed')
    except requests.exceptions.ConnectionError as e:
        print(f"Connection error: {e}", file=sys.stderr)
        raise Exception('🌐 Нет подключения к интернету\n\nПроверьте соединение и попробуйте снова ☕')
    except requests.exceptions.Timeout as e:
        print(f"Timeout error: {e}", file=sys.stderr)
        raise Exception('🌐 Превышено время ожидания ответа от сервера\n\nПроверьте подключение к интернету ☕')
    except Exception as e:
        print(f"Gemini error: {e}", file=sys.stderr)
        raise e

def recognize_with_yandex(image_path):
    """Распознавание изображения через YandexGPT с Vision"""
    try:
        import requests

        base64_image = encode_image(image_path)

        prompt = """Распознай форму обратной связи "Квиз, плиз!" на изображении.
Извлеки: название команды, оценки 1-10 по категориям, комментарий.
Верни ТОЛЬКО JSON: {"team_name":"...","comment":"...","ratings":{"difficulty":7,"questions_like":8,"organization":6,"host":9,"bar":7,"overall":8}}"""

        # YandexGPT Pro с поддержкой изображений
        payload = {
            "modelUri": f"gpt://{YANDEX_FOLDER_ID}/yandexgpt/latest-pro",
            "completionOptions": {
                "stream": False,
                "temperature": 0.1,
                "maxTokens": "1000"
            },
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image",
                            "data": base64_image
                        }
                    ]
                }
            ]
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Api-Key {YANDEX_API_KEY}',
            'x-folder-id': YANDEX_FOLDER_ID
        }

        print("Отправка запроса к YandexGPT Pro...", file=sys.stderr)

        response = requests.post(
            'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
            headers=headers,
            json=payload,
            timeout=120
        )

        result = response.json()

        if response.status_code != 200:
            error_msg = result.get('error', {}).get('message', str(result)) if isinstance(result, dict) else str(result)
            print(f"Yandex Error: {response.status_code} - {error_msg}", file=sys.stderr)
            raise Exception(f'Yandex Error {response.status_code}: {error_msg}')

        content = result['result']['alternatives'][0]['message']['text']
        print(f"Response: {content[:300]}...", file=sys.stderr)

        # Парсим JSON
        import re
        json_match = None
        json_pattern = r'\{[\s\S]*?"ratings"[\s\S]*?\}'
        match = re.search(json_pattern, content)

        if match:
            json_match = match.group()
            if '```' in json_match:
                code_pattern = r'```json\s*([\s\S]*?)\s*```'
                code_match = re.search(code_pattern, json_match)
                if code_match:
                    json_match = code_match.group(1)
        else:
            code_pattern = r'```json\s*([\s\S]*?)\s*```'
            code_match = re.search(code_pattern, content)
            if code_match:
                json_match = code_match.group(1)

        if json_match:
            json_match = json_match.strip()
            start = json_match.find('{')
            end = json_match.rfind('}') + 1
            if start >= 0 and end > start:
                json_match = json_match[start:end]
            
            try:
                parsed = json.loads(json_match)
                return {
                    'success': True,
                    'team_name': parsed.get('team_name', ''),
                    'comment': parsed.get('comment', ''),
                    'ratings': parsed.get('ratings', {}),
                    'method': 'yandex'
                }
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}", file=sys.stderr)
                raise Exception(f'Invalid JSON: {e}')
        else:
            raise Exception('No JSON found in response')

    except ImportError:
        raise Exception('requests module not installed')
    except Exception as e:
        print(f"Yandex error: {e}", file=sys.stderr)
        raise e

def recognize_with_paddleocr(image_path):
    """Распознавание текста через PaddleOCR (лучше для рукописного текста)"""
    try:
        from paddleocr import PaddleOCR
        
        print("Инициализация PaddleOCR...", file=sys.stderr)
        
        # Инициализируем PaddleOCR с русским языком
        ocr = PaddleOCR(
            use_angle_cls=True,
            lang='ru',
            use_gpu=False,
            show_log=False,
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
            rec_batch_num=6
        )
        
        print("Распознавание через PaddleOCR...", file=sys.stderr)
        
        # Выполняем распознавание
        result = ocr.ocr(image_path, cls=True)
        
        # Извлекаем текст из результатов
        text_lines = []
        if result and result[0]:
            for line in result[0]:
                if line and len(line) >= 2:
                    text = line[1][0]
                    confidence = line[1][1]
                    if confidence > 0.3:  # Фильтруем низкокачественные результаты
                        text_lines.append(text)
        
        full_text = '\n'.join(text_lines)
        print(f"PaddleOCR распознал: {full_text[:200]}...", file=sys.stderr)
        
        # Парсим текст
        data = parse_paddleocr_text(full_text)
        
        return {
            'success': True,
            'team_name': data.get('team_name', ''),
            'comment': data.get('comment', ''),
            'ratings': data.get('ratings', {}),
            'method': 'paddleocr'
        }
        
    except ImportError as e:
        print(f"PaddleOCR not installed: {e}", file=sys.stderr)
        raise Exception('PaddleOCR не установлен')
    except Exception as e:
        print(f"PaddleOCR error: {e}", file=sys.stderr)
        raise e

def parse_paddleocr_text(text):
    """Парсинг текста из PaddleOCR"""
    lines = text.split('\n')
    lines = [line.strip() for line in lines if line.strip()]
    
    data = {
        'team_name': '',
        'comment': '',
        'ratings': {}
    }
    
    # Ищем название команды
    team_keywords = ['название команды', 'команда', 'team name']
    for i, line in enumerate(lines):
        line_lower = line.lower()
        
        # Проверяем наличие ключевых слов
        if any(keyword in line_lower for keyword in team_keywords):
            if i + 1 < len(lines):
                data['team_name'] = lines[i + 1].strip()
                break
        
        # Если строка короткая (2-25 символов) и не содержит цифр - возможно это название
        if not data['team_name'] and 2 <= len(line) <= 25 and not line[0].isdigit():
            # Пропускаем служебные слова
            skip_words = ['квиз', 'плиз', 'спасибо', 'оцените', 'пожалуйста']
            if not any(word in line_lower for word in skip_words):
                data['team_name'] = line
    
    # Ищем комментарий (расширенный поиск)
    comment_keywords = ['комментариев', 'комментарий', 'рисунков', 'отзыв', 'отзывы', 'пожелания', 'замечания']
    comment_found = False
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        
        if any(keyword in line_lower for keyword in comment_keywords):
            # Собираем все строки после ключевого слова
            comment_parts = []
            for j in range(i + 1, len(lines)):
                comment_line = lines[j].strip()
                if len(comment_line) > 2:
                    # Пропускаем слова благодарности
                    if 'спасибо' not in comment_line.lower() and 'квиз' not in comment_line.lower():
                        comment_parts.append(comment_line)
                    else:
                        break
            if comment_parts:
                data['comment'] = ' '.join(comment_parts)
                comment_found = True
                break
    
    # Если не нашли комментарий по ключевым словам, берём последние несколько строк
    if not comment_found and len(lines) > 3:
        # Берём последние 2-5 строк как потенциальный комментарий
        last_lines = lines[-min(5, len(lines)): ]
        comment_parts = []
        for line in last_lines:
            line_lower = line.lower()
            # Пропускаем служебные слова
            skip_words = ['спасибо', 'квиз', 'плиз', 'оцените', 'название', 'команда']
            if not any(word in line_lower for word in skip_words) and len(line) > 3:
                comment_parts.append(line)
        if comment_parts:
            data['comment'] = ' '.join(comment_parts)

    # Ищем оценки
    data['ratings'] = detect_ratings_from_text(text)
    
    return data

def detect_ratings_from_text(text):
    """Распознавание оценок из текста"""
    ratings = {}
    
    # Паттерны для поиска оценок
    patterns = {
        'difficulty': r'сложность.*?(\d{1,2})',
        'questions_like': r'понравились.*?вопросы.*?(\d{1,2})',
        'organization': r'организация.*?(\d{1,2})',
        'host': r'ведущего.*?(\d{1,2})',
        'bar': r'бар.*?(\d{1,2})',
        'overall': r'общее.*?впечатление.*?(\d{1,2})'
    }
    
    text_lower = text.lower()
    
    for key, pattern in patterns.items():
        match = re.search(pattern, text_lower)
        if match:
            value = int(match.group(1))
            if 1 <= value <= 10:
                ratings[key] = value
    
    return ratings

def recognize_with_ollama(image_path):
    """Распознавание изображения через локальную модель Ollama (moondream)"""
    try:
        import requests

        base64_image = encode_image(image_path)

        prompt = """Analyze this image and extract text data from a feedback form.
Find: team name, ratings 1-10 for categories, and comment.
Return ONLY valid JSON:
{"team_name":"team name here","comment":"comment text","ratings":{"difficulty":7,"questions_like":8,"organization":6,"host":9,"bar":7,"overall":8}}
If you can't read a rating, omit it from JSON."""

        payload = {
            "model": OLLAMA_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                    "images": [base64_image]
                }
            ],
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 500
            }
        }

        headers = {
            'Content-Type': 'application/json'
        }

        print(f"Sending request to Ollama ({OLLAMA_URL})...", file=sys.stderr)

        response = requests.post(
            f'{OLLAMA_URL}/api/chat',
            headers=headers,
            json=payload,
            timeout=120
        )

        result = response.json()

        if response.status_code != 200:
            error_msg = result.get('error', 'Unknown error')
            print(f"Ollama Error: {response.status_code} - {error_msg}", file=sys.stderr)
            raise Exception(f'Ollama Error {response.status_code}: {error_msg}')

        content = result['message']['content']
        print(f"Response: {content[:500]}...", file=sys.stderr)

        # Пытаемся найти JSON в ответе
        import re
        json_match = None

        # Сначала ищем полный JSON объект с ratings
        json_pattern = r'\{[\s\S]*?"ratings"[\s\S]*?\}'
        match = re.search(json_pattern, content)

        if match:
            json_match = match.group()
            # Очищаем от markdown кода если есть
            if '```' in json_match:
                code_pattern = r'```json\s*([\s\S]*?)\s*```'
                code_match = re.search(code_pattern, json_match)
                if code_match:
                    json_match = code_match.group(1)
        else:
            # Ищем JSON в markdown блоке
            code_pattern = r'```json\s*([\s\S]*?)\s*```'
            code_match = re.search(code_pattern, content)
            if code_match:
                json_match = code_match.group(1)

        if json_match:
            # Очищаем от лишних символов
            json_match = json_match.strip()
            # Находим начало и конец JSON
            start = json_match.find('{')
            end = json_match.rfind('}') + 1
            if start >= 0 and end > start:
                json_match = json_match[start:end]
            
            try:
                parsed = json.loads(json_match)
                return {
                    'success': True,
                    'team_name': parsed.get('team_name', ''),
                    'comment': parsed.get('comment', ''),
                    'ratings': parsed.get('ratings', {}),
                    'method': 'ollama'
                }
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}, raw: {json_match[:200]}", file=sys.stderr)
                raise Exception(f'Invalid JSON: {e}')
        else:
            raise Exception('No JSON found in response')

    except ImportError:
        raise Exception('requests module not installed')
    except requests.exceptions.ConnectionError:
        raise Exception(f'Не удалось подключиться к Ollama по адресу {OLLAMA_URL}. Убедитесь, что Ollama запущен.')
    except Exception as e:
        print(f"Ollama error: {e}", file=sys.stderr)
        raise e

def get_gigachat_token():
    """Получает токен доступа GigaChat"""
    import requests
    import uuid
    
    url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': f'Basic {GIGACHAT_CREDENTIALS}',
        'RqUID': str(uuid.uuid4())  # Уникальный идентификатор запроса
    }
    
    data = 'scope=GIGACHAT_API_PERS'
    
    response = requests.post(url, headers=headers, data=data, timeout=30, verify=False)
    
    if response.status_code != 200:
        raise Exception(f'Ошибка получения токена GigaChat: {response.status_code} - {response.text}')
    
    token_data = response.json()
    return token_data.get('access_token')

def recognize_with_gigachat(image_path):
    """Распознавание изображения через GigaChat API"""
    try:
        import requests
        import urllib3
        
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        base64_image = encode_image(image_path)

        prompt = """Распознай форму обратной связи "Квиз, плиз!" на изображении.
Извлеки: название команды, оценки 1-10 по категориям, комментарий.
Верни ТОЛЬКО JSON: {"team_name":"...","comment":"...","ratings":{"difficulty":7,"questions_like":8,"organization":6,"host":9,"bar":7,"overall":8}}"""

        print("Получение токена GigaChat...", file=sys.stderr)
        token = get_gigachat_token()
        
        # Используем GigaChat-Max с поддержкой изображений
        payload = {
            "model": "GigaChat-Max",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                    ]
                }
            ],
            "temperature": 0.1
        }

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}'
        }

        print("Отправка запроса к GigaChat-Max...", file=sys.stderr)

        response = requests.post(
            'https://gigachat.devices.sberbank.ru/api/v2/chat/completions',
            headers=headers,
            json=payload,
            timeout=120,
            verify=False
        )

        result = response.json()

        if response.status_code != 200:
            error_msg = result.get('error', {}).get('message', 'Unknown error') if isinstance(result, dict) else str(result)
            print(f"GigaChat Error: {response.status_code} - {error_msg}", file=sys.stderr)
            raise Exception(f'GigaChat Error {response.status_code}: {error_msg}')

        content = result['choices'][0]['message']['content']
        print(f"Response: {content[:300]}...", file=sys.stderr)

        # Парсим JSON
        import re
        json_match = None
        json_pattern = r'\{[\s\S]*?"ratings"[\s\S]*?\}'
        match = re.search(json_pattern, content)

        if match:
            json_match = match.group()
            if '```' in json_match:
                code_pattern = r'```json\s*([\s\S]*?)\s*```'
                code_match = re.search(code_pattern, json_match)
                if code_match:
                    json_match = code_match.group(1)
        else:
            code_pattern = r'```json\s*([\s\S]*?)\s*```'
            code_match = re.search(code_pattern, content)
            if code_match:
                json_match = code_match.group(1)

        if json_match:
            json_match = json_match.strip()
            start = json_match.find('{')
            end = json_match.rfind('}') + 1
            if start >= 0 and end > start:
                json_match = json_match[start:end]
            
            try:
                parsed = json.loads(json_match)
                return {
                    'success': True,
                    'team_name': parsed.get('team_name', ''),
                    'comment': parsed.get('comment', ''),
                    'ratings': parsed.get('ratings', {}),
                    'method': 'gigachat'
                }
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}", file=sys.stderr)
                raise Exception(f'Invalid JSON: {e}')
        else:
            raise Exception('No JSON found in response')

    except ImportError:
        raise Exception('requests module not installed')
    except Exception as e:
        print(f"GigaChat error: {e}", file=sys.stderr)
        raise e

def recognize_with_easyocr(image_path):
    """Распознавание через EasyOCR (фоллбэк)"""
    try:
        import easyocr
        import ssl
        
        ssl._create_default_https_context = ssl._create_unverified_context
        
        print("Using EasyOCR as fallback...", file=sys.stderr)
        reader = easyocr.Reader(['ru', 'en'], gpu=False, verbose=False, download_enabled=True)
        
        results = reader.readtext(image_path, detail=0, paragraph=True, min_size=10)
        text = '\n'.join(results)
        
        # Парсим текст
        lines = text.split('\n')
        
        data = {
            'team_name': '',
            'comment': '',
            'ratings': {}
        }
        
        # Название команды
        for i, line in enumerate(lines):
            if 'название команды' in line.lower() or 'НАЗВАНИЕ' in line.upper():
                if i + 1 < len(lines):
                    candidate = lines[i + 1].strip()
                    if len(candidate) > 2:
                        import re
                        cleaned = re.sub(r'[@/7\\()]+', '', candidate).strip()
                        data['team_name'] = cleaned if len(cleaned) > 1 else candidate
                break
        
        # Комментарий
        for i, line in enumerate(lines):
            if 'комментариев' in line.lower() or 'рисунков' in line.lower():
                comment_lines = []
                for j in range(i + 1, len(lines)):
                    line_text = lines[j].strip()
                    if line_text and len(line_text) > 2 and 'спасибо' not in line_text.lower():
                        comment_lines.append(line_text)
                    elif 'спасибо' in line_text.lower():
                        break
                data['comment'] = ' '.join(comment_lines)
                break
        
        return {
            'success': True,
            'team_name': data['team_name'],
            'comment': data['comment'],
            'ratings': data['ratings'],  # EasyOCR плохо распознает оценки
            'method': 'easyocr'
        }
        
    except Exception as e:
        print(f"EasyOCR error: {e}", file=sys.stderr)
        raise e

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Не указан путь к изображению'
        }, ensure_ascii=False))
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        print(json.dumps({
            'success': False,
            'error': f'Файл не найден: {image_path}'
        }, ensure_ascii=False))
        sys.exit(1)
    
    print(f"Processing image: {image_path}", file=sys.stderr)

    # Google Gemini - основной метод (лучшее качество распознавания)
    try:
        result = recognize_with_gemini(image_path)
    except Exception as gemini_error:
        print(f"Gemini failed: {gemini_error}", file=sys.stderr)
        
        # PaddleOCR - резерв для текста
        try:
            result = recognize_with_paddleocr(image_path)
        except Exception as paddle_error:
            print(f"PaddleOCR failed: {paddle_error}", file=sys.stderr)
            
            # Ollama - локальный резерв
            try:
                result = recognize_with_ollama(image_path)
            except Exception as ollama_error:
                print(f"Ollama failed: {ollama_error}", file=sys.stderr)
                
                # Последний резерв - EasyOCR
                try:
                    result = recognize_with_easyocr(image_path)
                except Exception as easyocr_error:
                    result = {
                        'success': False,
                        'error': f'Gemini: {str(gemini_error)}, PaddleOCR: {str(paddle_error)}, EasyOCR: {str(easyocr_error)}'
                    }

    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
