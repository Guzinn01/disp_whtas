const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- LÓGICA DE DISPARO ---
    prepareAndReadExcel: () => ipcRenderer.invoke('prepare-and-read-excel'),
    getContactsFromDb: () => ipcRenderer.invoke('get-contacts-from-db'),
    updateStatus: (data) => ipcRenderer.invoke('update-status', data),
    sendWhatsappMessage: (data) => ipcRenderer.invoke('send-whatsapp-message', data),

    // --- LÓGICA DE SESSÕES ---
    getSessions: () => ipcRenderer.invoke('get-sessions'),
    addNewSession: (sessionName) => ipcRenderer.invoke('add-new-session', sessionName),
    removeSession: (sessionId) => ipcRenderer.invoke('remove-session', sessionId),
    reconnectSession: (sessionId) => ipcRenderer.invoke('reconnect-session', sessionId),
    disconnectSession: (sessionId) => ipcRenderer.invoke('disconnect-session', sessionId),

    // --- RECEPTORES DE EVENTOS (Listeners) ---
    onSessionQrCode: (callback) => ipcRenderer.on('session-qr-code', (event, data) => callback(data)),
    onSessionReady: (callback) => ipcRenderer.on('session-ready', (event, data) => callback(data)),
    onSessionDisconnected: (callback) => ipcRenderer.on('session-disconnected', (event, sessionId) => callback(sessionId)),
    onSessionRemoved: (callback) => ipcRenderer.on('session-removed', (event, sessionId) => callback(sessionId)),
});