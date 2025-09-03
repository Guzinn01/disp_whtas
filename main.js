const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const { initialize, sendMessage, logout } = require('./src/whats');

let mainWindow;
let isWhatsappConnected = false;
let db;

// --- CAMINHO DO BANCO DE DADOS ALTERADO ---
// Agora ele salvará o arquivo dentro da pasta 'src/data' do seu projeto.
const dbPath = path.join(__dirname, 'src', 'data', 'database.sqlite');

async function openDb() {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        console.log(`[DB] Conexão com o banco de dados estabelecida em: ${dbPath}`);
        await db.exec('CREATE TABLE IF NOT EXISTS contacts (name TEXT, phone TEXT, status TEXT)');
    } catch (error) {
        console.error('[DB] Erro ao conectar com o banco de dados:', error);
    }
}

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
    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(async () => {
    await openDb();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // O restante do código permanece o mesmo
    ipcMain.handle('prepare-and-read-excel', async () => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openFile'],
                filters: [{ name: 'Planilhas', extensions: ['xlsx', 'xls'] }]
            });

            if (result.canceled) return { success: false, error: 'Nenhum arquivo selecionado.' };

            const filePath = result.filePaths[0];
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(worksheet);

            await db.exec('DROP TABLE IF EXISTS contacts');
            await db.exec('CREATE TABLE contacts (name TEXT, phone TEXT, status TEXT)');

            const stmt = await db.prepare('INSERT INTO contacts (name, phone, status) VALUES (?, ?, ?)');
            for (const row of jsonData) {
                if (row.Nome && row.Telefone) {
                    const sanitizedPhone = String(row.Telefone).replace(/\D/g, '');
                    await stmt.run(row.Nome, sanitizedPhone, 'Preparado');
                }
            }
            await stmt.finalize();

            console.log(`[DB] Gravação de ${jsonData.length} contatos concluída.`);
            return { success: true, message: `${jsonData.length} contatos carregados para o banco de dados.` };
        } catch (error) {
            console.error('Erro no processo de preparação do arquivo:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-contacts-from-db', async () => {
        try {
            const rows = await db.all("SELECT name, phone, status FROM contacts WHERE status = 'Preparado'");
            return rows;
        } catch (error) {
            console.error('Erro ao buscar contatos do DB:', error);
            return [];
        }
    });

    ipcMain.handle('update-status', async (event, { phone, status }) => {
        try {
            await db.run('UPDATE contacts SET status = ? WHERE phone = ?', [status, phone]);
            return { success: true };
        } catch (error) {
            console.error('Erro ao atualizar status no DB:', error);
            return { success: false, error: error.message };
        }
    });

    // Handlers do WhatsApp
    ipcMain.handle('connect-whatsapp', async () => {
        return new Promise((resolve) => {
            initialize(
                (qrCode) => { mainWindow.webContents.send('qr-code', qrCode); mainWindow.webContents.send('connection-status', 'Conectando...'); },
                () => { isWhatsappConnected = true; mainWindow.webContents.send('connection-status', 'Conectado'); resolve({ success: true }); },
                () => { isWhatsappConnected = false; mainWindow.webContents.send('connection-status', 'Desconectado'); }
            );
        });
    });
    ipcMain.handle('disconnect-whatsapp', async () => {
        const result = await logout();
        if (result.success) { mainWindow.webContents.send('connection-status', 'Desconectado'); }
        return result;
    });
    ipcMain.handle('send-whatsapp-message', async (event, { number, message }) => {
        if (!isWhatsappConnected) { return { success: false, error: 'Não há conexão com o WhatsApp.' }; }
        const result = await sendMessage(number, message);
        return result;
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});