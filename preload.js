const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    prepareAndReadExcel: () => ipcRenderer.invoke('prepare-and-read-excel'),
    updateStatus: (data) => ipcRenderer.invoke('update-status', data),
    sendWhatsappMessage: (data) => ipcRenderer.invoke('send-whatsapp-message', data),
    getContactsFromDb: () => ipcRenderer.invoke('get-contacts-from-db'),
    connectWhatsapp: () => ipcRenderer.invoke('connect-whatsapp'),
    disconnectWhatsapp: () => ipcRenderer.invoke('disconnect-whatsapp'),
    onQrCode: (callback) => ipcRenderer.on('qr-code', (event, qr) => callback(qr)),
    onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (event, status) => callback(status)),
});