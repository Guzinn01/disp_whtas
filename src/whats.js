// src/whats.js

const { Client, LocalAuth } = require('whatsapp-web.js');

let client;
let isReady = false;

module.exports = {
    // Função para iniciar o cliente do WhatsApp e gerar o QR Code
    initialize: (sendQrCodeToRenderer, onReady, onDisconnected) => {
        if (client && isReady) {
            onReady();
            return;
        }

        client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'electron-whatsapp'
            }),
            // A seção 'puppeteer' foi removida para deixar a biblioteca gerenciar o navegador.
            // Isso geralmente resolve problemas de compatibilidade e geração de QR Code.
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
            client = null; // Limpa a instância do cliente para permitir uma nova conexão
            onDisconnected(reason); // Notifica o front-end sobre a desconexão
        });

        client.initialize();
    },

    // Função para desconectar o cliente
    logout: async () => {
        if (client) {
            try {
                await client.logout();
                // O evento 'disconnected' cuidará de limpar as variáveis
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
            // Adiciona o DDI 55 (Brasil) se não estiver presente e formata o número
            const sanitizedNumber = number.startsWith('55') ? number : `55${number}`;
            const chatId = `${sanitizedNumber}@c.us`;

            const isRegistered = await client.isRegisteredUser(chatId);
            if (!isRegistered) {
                return { success: false, error: 'O número não está registrado no WhatsApp.' };
            }

            await client.sendMessage(chatId, message);
            return { success: true };

        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            return { success: false, error: error.message };
        }
    }
};
