const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { Client, LocalAuth } = require('whatsapp-web.js');
const crypto = require('crypto');

// --- Variáveis Globais ---
let mainWindow;
let db;
// Usaremos um Map para gerir múltiplos clientes ativos. A chave será o ID da sessão.
const activeClients = new Map();

const dbPath = path.join(__dirname, 'src', 'data', 'database.sqlite');

// --- Funções Principais ---

// Função de inicialização do banco de dados
async function openDb() {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        console.log(`[DB] Conexão com o banco de dados estabelecida em: ${dbPath}`);
        // Garante que as tabelas existem
        await db.exec('CREATE TABLE IF NOT EXISTS contacts (name TEXT, phone TEXT, status TEXT)');
        await db.exec('CREATE TABLE IF NOT EXISTS sessions (sessionId TEXT PRIMARY KEY, sessionName TEXT, phoneNumber TEXT, status TEXT)');
    } catch (error) {
        console.error('[DB] Erro ao conectar com o banco de dados:', error);
    }
}

// Função para criar a janela da aplicação
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
}

// --- Lógica Principal da Aplicação ---

app.whenReady().then(async () => {
    await openDb(); // Garante que o DB está pronto antes de tudo
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // --- Handlers de Comunicação com a Interface (IPC) ---

    // Handler para buscar as sessões salvas no DB
    ipcMain.handle('get-sessions', async () => {
        try {
            return await db.all("SELECT sessionId, sessionName, phoneNumber, status FROM sessions");
        } catch (error) {
            console.error('[DB] Erro ao buscar sessões:', error);
            return [];
        }
    });

    // Handler para adicionar e conectar uma nova sessão de WhatsApp
    ipcMain.handle('add-new-session', async (event, sessionName) => {
        const sessionId = crypto.randomUUID();
        console.log(`[WPP] Iniciando nova sessão com ID: ${sessionId}`);

        const client = new Client({
            authStrategy: new LocalAuth({ clientId: sessionId }),
            puppeteer: { headless: false, args: ['--no-sandbox'] }
        });

        client.on('qr', (qr) => {
            mainWindow.webContents.send('session-qr-code', { sessionId, qr });
        });

        client.on('ready', async () => {
            const phoneNumber = client.info.wid.user;
            console.log(`[WPP] Cliente para ${phoneNumber} (Sessão: ${sessionId}) está pronto!`);
            await db.run('INSERT OR REPLACE INTO sessions (sessionId, sessionName, phoneNumber, status) VALUES (?, ?, ?, ?)', [sessionId, sessionName, phoneNumber, 'CONECTADO']);
            activeClients.set(sessionId, client);
            mainWindow.webContents.send('session-ready', { sessionId, phoneNumber });
        });

        client.on('disconnected', async (reason) => {
            console.log(`[WPP] Sessão ${sessionId} desconectada.`, reason);
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
            const client = activeClients.get(sessionId);
            if (client) {
                await client.logout();
                activeClients.delete(sessionId);
            }
            await db.run('DELETE FROM sessions WHERE sessionId = ?', sessionId);
            // TODO: Adicionar lógica para apagar a pasta .wwebjs_auth/session-[sessionId]
            return { success: true };
        } catch (error) {
            console.error(`Erro ao remover sessão ${sessionId}:`, error);
            return { success: false, error: error.message };
        }
    });

    // Handler para carregar a planilha e salvar os contatos no DB
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
                if (row.nome && row.telefone) {
                    const sanitizedPhone = String(row.telefone).replace(/\D/g, '');
                    await stmt.run(row.nome, sanitizedPhone, 'Preparado');
                }
            }
            await stmt.finalize();

            return { success: true, message: `${jsonData.length} contatos carregados.` };
        } catch (error) {
            console.error('Erro no processo de preparação do arquivo:', error);
            return { success: false, error: error.message };
        }
    });

    // Handler para buscar contatos do DB
    ipcMain.handle('get-contacts-from-db', async () => {
        try {
            return await db.all("SELECT name, phone, status FROM contacts WHERE status = 'Preparado'");
        } catch (error) {
            console.error('Erro ao buscar contatos do DB:', error);
            return [];
        }
    });

    // Handler para atualizar o status de um contato no DB
    ipcMain.handle('update-status', async (event, { phone, status }) => {
        try {
            await db.run('UPDATE contacts SET status = ? WHERE phone = ?', [status, phone]);
            return { success: true };
        } catch (error) {
            console.error('Erro ao atualizar status no DB:', error);
            return { success: false, error: error.message };
        }
    });

    // Handler para enviar uma mensagem usando uma sessão específica
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

    ipcMain.handle('reconnect-session', async (event, sessionId) => {
        console.log(`[WPP] Tentando reconectar a sessão: ${sessionId}`);
        const client = new Client({
            authStrategy: new LocalAuth({ clientId: sessionId }),
            puppeteer: { headless: false, args: ['--no-sandbox'] }
        });

        client.on('ready', async () => {
            const phoneNumber = client.info.wid.user;
            console.log(`[WPP] Cliente para ${phoneNumber} (Sessão: ${sessionId}) foi reconectado!`);
            await db.run('UPDATE sessions SET status = ? WHERE sessionId = ?', ['CONECTADO', sessionId]);
            activeClients.set(sessionId, client);
            mainWindow.webContents.send('session-ready', { sessionId, phoneNumber });
        });

        client.on('disconnected', async (reason) => {
            console.log(`[WPP] Sessão ${sessionId} desconectada.`, reason);
            await db.run('UPDATE sessions SET status = ? WHERE sessionId = ?', ['DESCONECTADO', sessionId]);
            activeClients.delete(sessionId);
            mainWindow.webContents.send('session-disconnected', sessionId);
        });

        // O 'auth_failure' é importante para o caso de a sessão ter sido invalidada (ex: desconectado pelo celular)
        client.on('auth_failure', async (msg) => {
            console.error(`[WPP] Falha na autenticação da sessão ${sessionId}:`, msg);
            await db.run('DELETE FROM sessions WHERE sessionId = ?', sessionId); // Remove a sessão inválida
            activeClients.delete(sessionId);
            mainWindow.webContents.send('session-removed', sessionId); // Avisa a interface para remover
        });

        client.initialize();
        return { success: true };
    });

    ipcMain.handle('disconnect-session', async (event, sessionId) => {
        try {
            console.log(`[WPP] Desconectando sessão: ${sessionId}`);
            const client = activeClients.get(sessionId);
            if (client) {
                await client.logout(); // Apenas faz o logout, o evento 'disconnected' fará o resto
                return { success: true };
            }
            // Se o cliente não estiver ativo, apenas atualiza o DB para garantir
            await db.run('UPDATE sessions SET status = ? WHERE sessionId = ?', ['DESCONECTADO', sessionId]);
            return { success: true };
        } catch (error) {
            console.error(`Erro ao desconectar sessão ${sessionId}:`, error);
            return { success: false, error: error.message };
        }
    });

});

// --- Eventos do Ciclo de Vida da Aplicação ---
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
