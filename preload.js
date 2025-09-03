// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Expõe a função para ler e preparar a planilha
    readAndPrepareExcel: (filePath) => ipcRenderer.invoke('read-and-prepare-excel', filePath),

    // Expõe a função para atualizar o status de um contato
    updateStatus: (data) => ipcRenderer.invoke('update-status', data),

    // Expõe a função para iniciar a conexão com o WhatsApp
    connectWhatsapp: () => ipcRenderer.invoke('connect-whatsapp'),

    // Expõe a função para desconectar o cliente do WhatsApp
    disconnectWhatsapp: () => ipcRenderer.invoke('disconnect-whatsapp'),

    // Expõe a função para enviar uma mensagem via WhatsApp
    sendWhatsappMessage: (data) => ipcRenderer.invoke('send-whatsapp-message', data),

    // Escuta por eventos do backend para receber o QR Code
    onQrCode: (callback) => ipcRenderer.on('qr-code', (event, qr) => callback(qr)),

    // Escuta por eventos do backend para o status da conexão
    onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (event, status) => callback(status))
});
