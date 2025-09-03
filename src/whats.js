// src/whats.js

const { Client, LocalAuth } = require('whatsapp-web.js');

let client;
let isReady = false;

module.exports = {
    // Função para iniciar o cliente do WhatsApp e gerar o QR Code
    initialize: (sendQrCodeToRenderer, onReady, onDisconnected, executablePath) => {
        if (client && isReady) {
            onReady();
            return;
        }

        client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'electron-whatsapp'
            }),
            puppeteer: {
                // Usa o caminho correto do executável do navegador que veio do main.js
                executablePath: executablePath
            }
        });

        // Evento: QR Code gerado
        client.on('qr', (qr) => {
            console.log('QR CODE RECEBIDO', qr);
            sendQrCodeToRenderer(qr); // Envia o QR Code para o front-end
        });

        // Evento: Cliente pronto para uso
        client.on('ready', () => {
            console.log('Cliente do WhatsApp está pronto!');
            isReady = true;
            onReady(); // Notifica o front-end que a conexão está estabelecida
        });

        // Evento: Desconexão (manual ou automática)
        client.on('disconnected', (reason) => {
            console.log('Cliente desconectado', reason);
            isReady = false;
            onDisconnected(reason); // Notifica o front-end sobre a desconexão
        });

        client.initialize();
    },

    // Função para desconectar o cliente
    logout: async () => {
        if (client) {
            try {
                await client.logout();
                client = null;
                isReady = false;
                console.log('Cliente do WhatsApp desconectado com sucesso.');
                return { success: true };
            } catch (error) {
                console.error('Erro ao desconectar:', error);
                return { success: false, error: error.message };
            }
        }
        return { success: true }; // Já estava desconectado
    },

    // Função para enviar uma mensagem
    sendMessage: async (number, message) => {
        if (!client || !isReady) {
            return { success: false, error: 'Cliente do WhatsApp não está pronto.' };
        }
        try {
            const chat = await client.getChatById(number + '@c.us');
            if (chat) {
                await chat.sendMessage(message);
                return { success: true };
            } else {
                return { success: false, error: 'Chat não encontrado.' };
            }
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            return { success: false, error: error.message };
        }
    }
};
