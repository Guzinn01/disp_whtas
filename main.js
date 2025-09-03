// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const xlsx = require('xlsx');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'src/preload.js')
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    ipcMain.handle('read-and-prepare-excel', async (event, filePath) => {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(worksheet);

            // Adiciona a coluna "status" com o valor "Pendente"
            const preparedData = jsonData.map(row => {
                if (row.telefone) {
                    row.telefone = String(row.telefone).replace(/\s/g, '');
                }
                // Garante que o status 'Enviado' não seja sobrescrito
                if (!row.status || row.status === '') {
                    row.status = 'Pendente';
                }
                return row;
            });

            // Cria um novo worksheet com os dados atualizados
            const newWorksheet = xlsx.utils.json_to_sheet(preparedData);
            const newWorkbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);

            // Salva a planilha com a coluna 'status'
            xlsx.writeFile(newWorkbook, filePath);

            return { success: true, data: preparedData };

        } catch (error) {
            console.error('Erro ao preparar o arquivo Excel:', error);
            return { success: false, error: error.message };
        }
    });

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

});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});