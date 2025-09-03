// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Expõe a função para ler e preparar a planilha
    readAndPrepareExcel: (filePath) => ipcRenderer.invoke('read-and-prepare-excel', filePath),

    // Expõe a função para atualizar o status de um contato
    updateStatus: (data) => ipcRenderer.invoke('update-status', data)
});