const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Элементы DOM
const dropZone = document.getElementById('dropZone');
const previewContainer = document.getElementById('previewContainer');
const fileInput = document.getElementById('fileInput');
const previewImage = document.getElementById('previewImage');
const formSection = document.getElementById('formSection');
const statusMessage = document.getElementById('statusMessage');
const feedbackForm = document.getElementById('feedbackForm');
const queuePanel = document.getElementById('queuePanel');
const queueList = document.getElementById('queueList');
const processAllBtn = document.getElementById('processAllBtn');

// Поля формы
const gameNameInput = document.getElementById('gameName');
const teamNameInput = document.getElementById('teamName');
const commentInput = document.getElementById('comment');

// Слайдеры оценок
const ratingSliders = {
  difficulty: document.getElementById('difficulty'),
  questionsLike: document.getElementById('questionsLike'),
  organization: document.getElementById('organization'),
  host: document.getElementById('host'),
  bar: document.getElementById('bar'),
  overall: document.getElementById('overall')
};

// Значения оценок
const ratingValues = {
  difficulty: document.getElementById('difficultyValue'),
  questionsLike: document.getElementById('questionsLikeValue'),
  organization: document.getElementById('organizationValue'),
  host: document.getElementById('hostValue'),
  bar: document.getElementById('barValue'),
  overall: document.getElementById('overallValue')
};

let imageQueue = [];
let currentImageIndex = -1;
let history = JSON.parse(localStorage.getItem('feedbackHistory') || '[]');

// Инициализация
function init() {
  setupEventListeners();
  updateHistoryTable();
  loadQueueFromStorage();
}

function setupEventListeners() {
  // Drag & Drop
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', handleDrop);

  // Форма
  feedbackForm.addEventListener('submit', handleSubmit);
  document.getElementById('resetBtn').addEventListener('click', resetForm);

  // Обработка всех
  processAllBtn.addEventListener('click', processAllQueue);

  // Слайдеры
  Object.keys(ratingSliders).forEach(key => {
    ratingSliders[key].addEventListener('input', (e) => {
      ratingValues[key].textContent = e.target.value;
    });
  });

  // Прогресс OCR от главного процесса
  ipcRenderer.on('ocr-progress', (event, message) => {
    if (message.status === 'recognizing text') {
      showStatus(`Распознавание: ${Math.round(message.progress * 100)}%`, 'loading');
    }
  });
}

function handleDrop(e) {
  e.preventDefault();
  dropZone.classList.remove('dragover');

  const files = e.dataTransfer.files;
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  
  if (imageFiles.length > 0) {
    addFilesToQueue(imageFiles);
  } else {
    showStatus('Пожалуйста, перетащите изображения', 'error');
  }
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length > 0) {
    addFilesToQueue(files);
  }
}

function addFilesToQueue(files) {
  files.forEach(file => {
    const queueItem = {
      id: Date.now() + Math.random(),
      file: file,
      path: file.path || null,
      name: file.name,
      status: 'pending', // pending, processing, completed, error
      result: null,
      thumbnail: null
    };
    
    // Создаём thumbnail
    const reader = new FileReader();
    reader.onload = (e) => {
      queueItem.thumbnail = e.target.result;
      imageQueue.push(queueItem);
      renderQueue();
      saveQueueToStorage();
    };
    reader.readAsDataURL(file);
  });
  
  // Показываем панель очереди
  queuePanel.classList.add('active');
  processAllBtn.style.display = 'block';
  
  showStatus(`Добавлено ${files.length} изображений(ия) в очередь`, 'success');
}

function renderQueue() {
  queueList.innerHTML = '';
  
  imageQueue.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = `queue-item ${item.status}`;
    if (index === currentImageIndex) li.classList.add('active');
    
    li.innerHTML = `
      <img class="queue-item-thumbnail" src="${item.thumbnail || ''}" alt="Preview">
      <div class="queue-item-info">
        <div class="queue-item-name">${item.name}</div>
        <div class="queue-item-status">${getStatusText(item.status)}</div>
      </div>
      <div class="queue-item-actions">
        <button class="btn-small view" onclick="viewImage(${index})">👁️</button>
        <button class="btn-small delete" onclick="removeFromQueue(${index})">🗑️</button>
      </div>
    `;
    
    li.addEventListener('click', (e) => {
      if (!e.target.classList.contains('btn-small')) {
        viewImage(index);
      }
    });
    
    queueList.appendChild(li);
  });
  
  // Показываем кнопку обработки если есть необработанные
  const hasPending = imageQueue.some(item => item.status === 'pending');
  processAllBtn.style.display = hasPending ? 'block' : 'none';
}

function getStatusText(status) {
  const statusTexts = {
    'pending': '⏳ Ожидает обработки',
    'processing': '🔄 Обработка...',
    'completed': '✅ Готово',
    'error': '❌ Ошибка'
  };
  return statusTexts[status] || status;
}

function viewImage(index) {
  currentImageIndex = index;
  const item = imageQueue[index];
  
  if (!item) return;
  
  // Показываем превью
  previewImage.src = item.thumbnail;
  previewContainer.style.display = 'block';
  dropZone.style.display = 'none';
  
  // Сбрасываем форму перед показом
  feedbackForm.reset();
  Object.keys(ratingSliders).forEach(key => {
    ratingSliders[key].value = 5;
    ratingValues[key].textContent = '-';
  });
  
  // Если уже обработано - показываем результат
  if (item.result && item.result.success) {
    fillFormWithData(item.result);
    formSection.classList.add('active');
    showStatus('✅ Распознавание завершено! Проверьте данные и отправьте форму.', 'success');
  } else if (item.status === 'pending') {
    // Обрабатываем
    processQueueItem(index);
  }
  
  renderQueue();
}

function removeFromQueue(index) {
  event.stopPropagation();
  imageQueue.splice(index, 1);
  if (currentImageIndex === index) {
    currentImageIndex = -1;
    resetForm();
  } else if (currentImageIndex > index) {
    currentImageIndex--;
  }
  saveQueueToStorage();
  renderQueue();
  
  if (imageQueue.length === 0) {
    queuePanel.classList.remove('active');
  }
}

function processAllQueue() {
  const pendingIndex = imageQueue.findIndex(item => item.status === 'pending');
  if (pendingIndex !== -1) {
    viewImage(pendingIndex);
  }
}

async function processQueueItem(index) {
  const item = imageQueue[index];
  if (!item) return;

  item.status = 'processing';
  renderQueue();

  showStatus('Обработка через Google Gemini...', 'loading');

  try {
    const result = await recognizeText(item.path || item.file);

    item.result = result;
    item.status = result.success ? 'completed' : 'error';

    if (result.success) {
      fillFormWithData(result);
      formSection.classList.add('active');
      showStatus('✅ Распознавание завершено! Проверьте данные и отправьте форму.', 'success');
    } else {
      showStatus('Ошибка распознавания: ' + (result.error || 'Неизвестная ошибка'), 'error');
    }
  } catch (error) {
    item.status = 'error';
    item.result = { success: false, error: error.message };
    showStatus('Ошибка распознавания: ' + error.message, 'error');
  }

  saveQueueToStorage();
  renderQueue();

  // Автоматически переходим к следующему
  const nextPending = imageQueue.findIndex((i, idx) => idx > index && i.status === 'pending');
  if (nextPending !== -1) {
    setTimeout(() => viewImage(nextPending), 1000);
  }
}

function fillFormWithData(result) {
  if (result.team_name) {
    teamNameInput.value = result.team_name;
  }

  if (result.comment) {
    commentInput.value = result.comment;
  }

  if (result.ratings) {
    if (result.ratings.difficulty) ratingSliders.difficulty.value = result.ratings.difficulty;
    if (result.ratings.questions_like) ratingSliders.questionsLike.value = result.ratings.questions_like;
    if (result.ratings.organization) ratingSliders.organization.value = result.ratings.organization;
    if (result.ratings.host) ratingSliders.host.value = result.ratings.host;
    if (result.ratings.bar) ratingSliders.bar.value = result.ratings.bar;
    if (result.ratings.overall) ratingSliders.overall.value = result.ratings.overall;
  }

  Object.keys(ratingSliders).forEach(key => {
    ratingValues[key].textContent = ratingSliders[key].value;
  });
}

async function recognizeText(imagePath) {
  showStatus('Отправка изображения Google Gemini...', 'loading');

  try {
    const result = await ipcRenderer.invoke('ocr-recognize', imagePath);
    console.log('Результат распознавания:', result);
    return result;
  } catch (error) {
    console.error('Ошибка распознавания:', error);
    return { success: false, error: error.message };
  }
}

async function handleSubmit(e) {
  e.preventDefault();

  const data = {
    timestamp: new Date().toISOString(),
    gameName: gameNameInput.value.trim(),
    teamName: teamNameInput.value.trim(),
    difficulty: parseInt(ratingSliders.difficulty.value),
    questionsLike: parseInt(ratingSliders.questionsLike.value),
    organization: parseInt(ratingSliders.organization.value),
    host: parseInt(ratingSliders.host.value),
    bar: parseInt(ratingSliders.bar.value),
    overall: parseInt(ratingSliders.overall.value),
    comment: commentInput.value.trim()
  };

  if (!data.gameName) {
    showStatus('Введите название игры', 'error');
    return;
  }

  showStatus('Отправка в Google Таблицу...', 'loading');

  try {
    await sendToGoogleSheets(data);
    addToHistory(data, 'success');
    showStatus('Данные успешно отправлены!', 'success');
    
    // Помечаем текущее как отправленное
    if (currentImageIndex >= 0 && imageQueue[currentImageIndex]) {
      imageQueue[currentImageIndex].status = 'completed';
      renderQueue();
    }
  } catch (error) {
    console.error('Ошибка отправки:', error);
    addToHistory(data, 'error');
    showStatus('Ошибка отправки: ' + error.message, 'error');
  }
}

async function sendToGoogleSheets(data) {
  const scriptUrl = 'https://script.google.com/macros/s/AKfycbzWP3beTSPBZxfcPuAg--ZNsQJHBn73QyDE6hEW8ZQzY476Glrms_UiWeJALEhuS5WwWQ/exec';

  if (!scriptUrl || scriptUrl.includes('YOUR_GOOGLE_APPS_SCRIPT')) {
    saveLocally(data);
    throw new Error('Необходимо настроить Google Sheets API. См. инструкцию в README.md');
  }

  const response = await fetch(scriptUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...data,
      timestamp: new Date().toLocaleString('ru-RU')
    })
  });

  return { success: true };
}

function saveLocally(data) {
  const localData = JSON.parse(localStorage.getItem('localFeedback') || '[]');
  localData.push(data);
  localStorage.setItem('localFeedback', JSON.stringify(localData));
}

function addToHistory(data, status) {
  history.unshift({ ...data, status });
  if (history.length > 50) {
    history = history.slice(0, 50);
  }
  localStorage.setItem('feedbackHistory', JSON.stringify(history));
  updateHistoryTable();
}

function updateHistoryTable() {
  const tbody = document.getElementById('historyBody');
  tbody.innerHTML = '';

  history.forEach(item => {
    const row = document.createElement('tr');
    const commentDisplay = item.comment ? (item.comment.length > 30 ? item.comment.substring(0, 30) + '...' : item.comment) : '-';
    row.innerHTML = `
      <td>${new Date(item.timestamp).toLocaleString('ru-RU')}</td>
      <td>${item.gameName}</td>
      <td>${item.teamName || '-'}</td>
      <td>${item.difficulty}</td>
      <td>${item.questionsLike}</td>
      <td>${item.organization}</td>
      <td>${item.host}</td>
      <td>${item.bar}</td>
      <td>${item.overall}</td>
      <td title="${commentDisplay}">${commentDisplay}</td>
      <td>${item.status === 'success' ? '✅' : '❌'}</td>
    `;
    tbody.appendChild(row);
  });
}

function resetForm() {
  formSection.classList.remove('active');
  feedbackForm.reset();
  previewImage.src = '';
  previewContainer.style.display = 'none';
  currentImagePath = null;
  fileInput.value = '';

  Object.keys(ratingSliders).forEach(key => {
    ratingSliders[key].value = 5;
    ratingValues[key].textContent = '-';
  });

  dropZone.style.display = 'block';
  statusMessage.classList.add('hidden');
}

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = 'status ' + type;
  statusMessage.classList.remove('hidden');
}

// Очередь в localStorage
function saveQueueToStorage() {
  const queueData = imageQueue.map(item => ({
    id: item.id,
    name: item.name,
    path: item.path,
    status: item.status,
    result: item.result,
    thumbnail: item.thumbnail
  }));
  localStorage.setItem('imageQueue', JSON.stringify(queueData));
}

function loadQueueFromStorage() {
  const queueData = JSON.parse(localStorage.getItem('imageQueue') || '[]');
  if (queueData.length > 0) {
    imageQueue = queueData.map(item => ({
      ...item,
      file: null // Файл не восстанавливаем
    }));
    queuePanel.classList.add('active');
    renderQueue();
  }
}

// Делаем функции доступными глобально
window.viewImage = viewImage;
window.removeFromQueue = removeFromQueue;

// Запуск
init();
