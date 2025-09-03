// renderer.js

// Referências para os elementos do DOM
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const connectionStatusDiv = document.getElementById('connection-status');
const connectionStatusText = connectionStatusDiv.querySelector('p');
const qrCodeContainer = document.getElementById('qr-code-container');
const qrStatusMessage = document.getElementById('qr-status-message');
const qrCodeImage = document.getElementById('qr-code-image');

const prepareBtn = document.getElementById('prepare-btn');
const startSendBtn = document.getElementById('start-send-btn');
const fileInput = document.getElementById('file-upload');
const messageInput = document.getElementById('message-input');
const delayInput = document.getElementById('delay-input');
const messageLog = document.getElementById('message-log');

// Referências para o modal
const modalOverlay = document.getElementById('custom-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalCloseBtn = document.getElementById('modal-close-btn');

let excelFilePath = null;

// Funções para gerenciar o estado da UI de conexão
const setConnectionStatus = (status) => {
    connectionStatusText.textContent = status;
    connectionStatusDiv.className = `status-${status.toLowerCase().replace(' ', '-')}`;
};

// Funções para exibir o modal personalizado
const showModal = (title, message) => {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalOverlay.classList.remove('hidden');
};

const hideModal = () => {
    modalOverlay.classList.add('hidden');
};

modalCloseBtn.addEventListener('click', hideModal);

// Evento de clique no botão "Conectar"
connectBtn.addEventListener('click', async () => {
    setConnectionStatus('Conectando...');
    connectBtn.disabled = true;

    qrStatusMessage.textContent = 'Gerando QR Code...';
    qrCodeImage.classList.remove('hidden');

    // Chama o backend para iniciar a conexão com o WhatsApp
    await window.electronAPI.connectWhatsapp();
});

// Evento de clique no botão "Desconectar"
disconnectBtn.addEventListener('click', async () => {
    logMessage('Desconectando...', 'info');
    disconnectBtn.disabled = true;
    const result = await window.electronAPI.disconnectWhatsapp();
    if (result.success) {
        logMessage('Desconectado com sucesso.', 'success');
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
    } else {
        logMessage(`Erro ao desconectar: ${result.error}`, 'error');
        disconnectBtn.disabled = false;
    }
});

// Eventos de recebimento do QR Code e status de conexão do backend
window.electronAPI.onQrCode((qr) => {
    qrStatusMessage.textContent = 'Por favor, escaneie o QR Code com seu celular:';
    qrCodeImage.src = `data:image/png;base64,${qr}`;
    qrCodeImage.classList.remove('hidden');
});

window.electronAPI.onConnectionStatus((status) => {
    setConnectionStatus(status);
    if (status === 'Conectado') {
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        qrCodeImage.classList.add('hidden');
        qrStatusMessage.textContent = 'Você está conectado!';
    } else {
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        qrCodeImage.classList.add('hidden');
        qrStatusMessage.textContent = '';

        // Exibe o modal quando a conexão for perdida (automática ou manual)
        if (status === 'Desconectado') {
            showModal('Conexão Perdida', 'A conexão com o WhatsApp foi perdida ou desconectada manualmente.');
        }
    }
});

// Evento de clique no botão de "Preparar Disparo"
prepareBtn.addEventListener('click', async () => {
    if (!fileInput.files.length) {
        showModal('Erro', 'Por favor, selecione um arquivo Excel.');
        return;
    }

    excelFilePath = fileInput.files[0].path;
    logMessage('Preparando a planilha. Por favor, aguarde...');

    const result = await window.electronAPI.readAndPrepareExcel(excelFilePath);

    if (result.success) {
        logMessage('Planilha preparada com sucesso! Status "Pendente" adicionado.', 'success');
        startSendBtn.disabled = false;
        prepareBtn.disabled = true;
    } else {
        showModal('Erro ao Preparar', `Erro ao preparar a planilha: ${result.error}`);
    }
});

// Evento de clique no botão de "Iniciar Disparo"
startSendBtn.addEventListener('click', async () => {
    const message = messageInput.value;
    const delay = parseInt(delayInput.value) * 1000;

    if (!message.trim()) {
        showModal('Erro', 'Por favor, digite a mensagem a ser enviada.');
        return;
    }

    if (!excelFilePath) {
        showModal('Erro', 'Por favor, prepare a planilha antes de iniciar o disparo.');
        return;
    }

    // Desabilita os botões para evitar cliques durante o disparo
    startSendBtn.disabled = true;
    prepareBtn.disabled = true;
    messageInput.disabled = true;
    delayInput.disabled = true;
    fileInput.disabled = true;

    logMessage('Iniciando o disparo de mensagens. Não feche esta janela.', 'info');

    try {
        const result = await window.electronAPI.readAndPrepareExcel(excelFilePath);

        if (!result.success) {
            logMessage(`Erro ao ler a planilha: ${result.error}`, 'error');
            return;
        }

        const pendingContacts = result.data.filter(contact => contact.status === 'Pendente');

        if (pendingContacts.length === 0) {
            logMessage('Nenhum contato com status "Pendente" encontrado.', 'info');
            return;
        }

        for (const contact of pendingContacts) {
            const personalizedMessage = message.replace(/{nome}/g, contact.nome);
            logMessage(`Enviando mensagem para ${contact.nome}...`, 'info');

            const sendResult = await window.electronAPI.sendWhatsappMessage({
                number: contact.telefone,
                message: personalizedMessage
            });

            if (sendResult.success) {
                logMessage(`Mensagem enviada para ${contact.nome}.`, 'success');
                await window.electronAPI.updateStatus({
                    filePath: excelFilePath,
                    telefone: contact.telefone,
                    status: 'Enviado'
                });
            } else {
                logMessage(`Falha ao enviar para ${contact.nome}: ${sendResult.error}`, 'error');
                await window.electronAPI.updateStatus({
                    filePath: excelFilePath,
                    telefone: contact.telefone,
                    status: 'Falha'
                });
            }

            await new Promise(resolve => setTimeout(resolve, delay));
        }

        logMessage('Disparo concluído! Todas as mensagens pendentes foram enviadas.', 'success');

    } catch (error) {
        logMessage(`Ocorreu um erro no processo de disparo: ${error.message}`, 'error');
    } finally {
        startSendBtn.disabled = false;
        prepareBtn.disabled = false;
        messageInput.disabled = false;
        delayInput.disabled = false;
        fileInput.disabled = false;
    }
});

// Função para registrar mensagens no log da interface
function logMessage(text, type = 'info') {
    const p = document.createElement('p');
    p.textContent = text;
    p.classList.add(type);
    messageLog.appendChild(p);
    messageLog.scrollTop = messageLog.scrollHeight;
}
