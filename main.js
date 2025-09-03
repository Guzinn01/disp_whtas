const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { Client, LocalAuth } = require('whatsapp-web.js'); // Importamos o Client e LocalAuth aqui
const crypto = require('crypto'); // Para gerar IDs únicos

let mainWindow;
let db;
// Usaremos um Map para gerir múltiplos clientes ativos. A chave será o ID da sessão.
const activeClients = new Map();

const dbPath = path.join(__dirname, 'src', 'data', 'database.sqlite');

// Função de inicialização do banco de dados atualizada
async function openDb() {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        console.log(`[DB] Conexão com o banco de dados estabelecida em: ${dbPath}`);
        // Garante que a tabela de contatos existe
        await db.exec('CREATE TABLE IF NOT EXISTS contacts (name TEXT, phone TEXT, status TEXT)');
        // Garante que a nova tabela de sessões existe
        await db.exec('CREATE TABLE IF NOT EXISTS sessions (sessionId TEXT PRIMARY KEY, phoneNumber TEXT, status TEXT)');
    } catch (error) {
        console.error('[DB] Erro ao conectar com o banco de dados:', error);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200, // Aumentei um pouco a largura para a nova interface
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

    // --- NOVOS HANDLERS PARA GESTÃO DE SESSÕES ---

    // Handler para buscar as sessões salvas no banco de dados
    ipcMain.handle('get-sessions', async () => {
        try {
            const sessions = await db.all("SELECT sessionId, phoneNumber, status FROM sessions");
            return sessions;
        } catch (error) {
            console.error('[DB] Erro ao buscar sessões:', error);
            return [];
        }
    });

    // Handler para iniciar a conexão de uma NOVA sessão
    ipcMain.handle('add-new-session', async () => {
        const sessionId = crypto.randomUUID(); // Gera um ID único para a nova sessão
        console.log(`[WPP] Iniciando nova sessão com ID: ${sessionId}`);

        const client = new Client({
            authStrategy: new LocalAuth({ clientId: sessionId }),
            puppeteer: {
                headless: true, // Roda o navegador em segundo plano
                args: ['--no-sandbox']
            }
        });

        client.on('qr', (qr) => {
            console.log(`[WPP] QR Code recebido para a sessão ${sessionId}`);
            // Envia o QR Code para a interface, junto com o ID da sessão
            mainWindow.webContents.send('session-qr-code', { sessionId, qr });
        });

        client.on('ready', async () => {
            const phoneNumber = client.info.wid.user;
            console.log(`[WPP] Cliente para o número ${phoneNumber} está pronto! Sessão: ${sessionId}`);

            // Salva a nova sessão no banco de dados
            await db.run('INSERT INTO sessions (sessionId, phoneNumber, status) VALUES (?, ?, ?)', [sessionId, phoneNumber, 'CONECTADO']);

            activeClients.set(sessionId, client); // Adiciona o cliente ao mapa de clientes ativos

            // Avisa a interface que a conexão foi bem-sucedida
            mainWindow.webContents.send('session-ready', { sessionId, phoneNumber });
        });

        client.on('disconnected', async (reason) => {
            console.log(`[WPP] Cliente da sessão ${sessionId} foi desconectado. Motivo:`, reason);
            await db.run('UPDATE sessions SET status = ? WHERE sessionId = ?', ['DESCONECTADO', sessionId]);
            activeClients.delete(sessionId);
            mainWindow.webContents.send('session-disconnected', sessionId);
        });

        client.initialize();
        return { success: true, sessionId };
    });

    // Handler para remover uma sessão
    ipcMain.handle('remove-session', async (event, sessionId) => {
        try {
            console.log(`[WPP] Removendo sessão: ${sessionId}`);
            const client = activeClients.get(sessionId);
            if (client) {
                await client.logout(); // Desconecta se estiver ativo
                activeClients.delete(sessionId);
            }
            // Remove do banco de dados
            await db.run('DELETE FROM sessions WHERE sessionId = ?', sessionId);
            // Aqui também deveríamos apagar a pasta da sessão, mas vamos manter simples por enquanto
            return { success: true };
        } catch (error) {
            console.error(`Erro ao remover sessão ${sessionId}:`, error);
            return { success: false, error: error.message };
        }
    });


    // --- HANDLERS EXISTENTES (COM PEQUENOS AJUSTES) ---

    // A lógica de preparar a planilha continua a mesma
    ipcMain.handle('prepare-and-read-excel', async () => { /* ...seu código existente... */ });
    ipcMain.handle('get-contacts-from-db', async () => { /* ...seu código existente... */ });
    ipcMain.handle('update-status', async (event, { phone, status }) => { /* ...seu código existente... */ });

    // O handler de enviar mensagem agora precisa saber QUAL sessão usar
    ipcMain.handle('send-whatsapp-message', async (event, { sessionId, number, message }) => {
        const client = activeClients.get(sessionId);
        if (!client) {
            return { success: false, error: 'Sessão não está conectada.' };
        }
        try {
            await client.sendMessage(`${number}@c.us`, message);
            return { success: true };
        } catch (error) {
            console.error(`Erro ao enviar mensagem pela sessão ${sessionId}:`, error);
            return { success: false, error: error.message };
        }
    });

});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Cole as funções de 'prepare-and-read-excel', 'get-contacts-from-db' e 'update-status' aqui
// para manter o arquivo completo e funcional.
ipcMain.handle('prepare-and-read-excel', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Planilhas', extensions: ['xlsx', 'xls'] }]
        });
        if (result.canceled) return { success: false, error: 'Nenhum ficheiro selecionado.' };
        const filePath = result.filePaths[0];
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);
        await db.exec('DROP TABLE IF EXISTS contacts');
        await db.exec('CREATE TABLE contacts (name TEXT, phone TEXT, status TEXT)');
        const stmt = await db.prepare('INSERT INTO contacts (name, phone, status) VALUES (?, ?, ?)');
        for (const row of jsonData) {
            if (row.nome && row.telefone) {
                const sanitizedPhone = String(row.telefone).replace(/\D/g, '');
                await stmt.run(row.nome, sanitizedPhone, 'Preparado');
            }
        }
        await stmt.finalize();
        return { success: true, message: `${jsonData.length} contactos carregados para a base de dados.` };
    } catch (error) {
        console.error('Erro no processo de preparação do ficheiro:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-contacts-from-db', async () => {
    try {
        const rows = await db.all("SELECT name, phone, status FROM contacts WHERE status = 'Preparado'");
        return rows;
    } catch (error) {
        console.error('Erro ao buscar contactos da BD:', error);
        return [];
    }
});

ipcMain.handle('update-status', async (event, { phone, status }) => {
    try {
        await db.run('UPDATE contacts SET status = ? WHERE phone = ?', [status, phone]);
        return { success: true };
    } catch (error) {
        console.error('Erro ao atualizar estado na BD:', error);
        return { success: false, error: error.message };
    }
});
