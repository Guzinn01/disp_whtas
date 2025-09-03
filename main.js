// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const { initialize, sendMessage, logout } = require('./src/whats');

let mainWindow;
let isWhatsappConnected = false;

// O banco de dados ainda está aqui, pronto para quando voltarmos a ele.
const dbPath = path.join(app.getPath('userData'), 'database.sqlite');
const db = new sqlite3.Database(dbPath);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // --- LINHAS ADICIONADAS PARA DEBUG ---
    // Força a limpeza do cache antes de carregar a página
    mainWindow.webContents.session.clearCache(() => {
        console.log('Cache limpo.');
    });
    // Abre as ferramentas de desenvolvedor (console) automaticamente
    mainWindow.webContents.openDevTools();
    // --- FIM DAS LINHAS ADICIONADAS ---

    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // Lógica para ler e preparar a planilha
    ipcMain.handle('read-and-prepare-excel', async (event, filePath) => {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(worksheet);

            const preparedData = jsonData.map(row => {
                if (row.telefone) {
                    row.telefone = String(row.telefone).replace(/\s/g, '');
                }
                if (!row.status || row.status === '') {
                    row.status = 'Pendente';
                }
                return row;
            });

            const newWorksheet = xlsx.utils.json_to_sheet(preparedData);
            const newWorkbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);

            xlsx.writeFile(newWorkbook, filePath);

            return { success: true, data: preparedData };

        } catch (error) {
            console.error('Erro ao preparar o arquivo Excel:', error);
            return { success: false, error: error.message };
        }
    });

    // Lógica para atualizar o status do envio
    ipcMain.handle('update-status', async (event, { filePath, telefone, status }) => {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(worksheet);

            const rowIndex = jsonData.findIndex(row => String(row.telefone).replace(/\s/g, '') === String(telefone).replace(/\s/g, ''));

            if (rowIndex !== -1) {
                jsonData[rowIndex].status = status;

                const newWorksheet = xlsx.utils.json_to_sheet(jsonData);
                const newWorkbook = xlsx.utils.book_new();
                xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
                xlsx.writeFile(newWorkbook, filePath);
                return { success: true };
            }

            return { success: false, error: 'Número de telefone não encontrado.' };

        } catch (error) {
            console.error('Erro ao atualizar o status:', error);
            return { success: false, error: error.message };
        }
    });

    // Lógica para iniciar a conexão com o WhatsApp
    ipcMain.handle('connect-whatsapp', async (event) => {
        return new Promise((resolve) => {
            initialize(
                (qrCode) => {
                    mainWindow.webContents.send('qr-code', qrCode);
                    mainWindow.webContents.send('connection-status', 'Conectando...');
                },
                () => {
                    isWhatsappConnected = true;
                    mainWindow.webContents.send('connection-status', 'Conectado');
                    resolve({ success: true });
                },
                () => {
                    isWhatsappConnected = false;
                    mainWindow.webContents.send('connection-status', 'Desconectado');
                }
            );
        });
    });

    // Lógica para desconectar o WhatsApp
    ipcMain.handle('disconnect-whatsapp', async () => {
        const result = await logout();
        if (result.success) {
            mainWindow.webContents.send('connection-status', 'Desconectado');
        }
        return result;
    });

    // Lógica para enviar a mensagem
    ipcMain.handle('send-whatsapp-message', async (event, { number, message }) => {
        if (!isWhatsappConnected) {
            return { success: false, error: 'Não há conexão com o WhatsApp.' };
        }
        const result = await sendMessage(number, message);
        return result;
    });

});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
