const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupOCRHandlers } = require('./ocr-handler');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.png'),
    // titleBarStyle: 'hiddenInset' // Убрали скрытую шапку
    titleBarStyle: 'default', // Стандартная шапка macOS
    trafficLightPosition: { x: 10, y: 10 } // Позиция кнопок управления окном
  });

  mainWindow.loadFile('index.html');
  
  // Обработка drag & drop файлов
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    item.setSavePath(path.join(__dirname, 'uploads', item.getFilename()));
  });
}

app.whenReady().then(() => {
  createWindow();
  setupOCRHandlers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC обработчики
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return [];
});

ipcMain.handle('read-file', async (event, filePath) => {
  return fs.readFileSync(filePath).toString('base64');
});

ipcMain.handle('get-app-path', () => {
  return __dirname;
});
