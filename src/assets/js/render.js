document.addEventListener('DOMContentLoaded', () => {
    // --- REFERÊNCIAS ---
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const connectionStatusDiv = document.getElementById('connection-status');
    const connectionStatusText = connectionStatusDiv.querySelector('p');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const qrStatusMessage = document.getElementById('qr-status-message');
    const qrCodeImage = document.getElementById('qr-code-image');
    const prepareBtn = document.getElementById('prepare-btn');
    const startSendBtn = document.getElementById('start-send-btn');
    const messageInput = document.getElementById('message-input');
    const delayInput = document.getElementById('delay-input');
    const messageLog = document.getElementById('message-log');
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    const themeToggle = document.getElementById('theme-toggle');
    let wasConnected = false;

    // --- FUNÇÕES ---
    const setConnectionStatus = (status) => {
        connectionStatusText.textContent = status;
        connectionStatusDiv.className = `status-${status.toLowerCase().replace(' ', '-')}`;
    };

    function logMessage(text, type = 'info') {
        const initialMessage = messageLog.querySelector('.initial');
        if (initialMessage) initialMessage.remove();
        const p = document.createElement('p');
        p.textContent = text;
        p.classList.add(type);
        messageLog.appendChild(p);
        messageLog.scrollTop = messageLog.scrollHeight;
    }

    const changePage = (pageId) => {
        pages.forEach(page => page.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === pageId) link.classList.add('active');
        });
    };

    // --- EVENTOS ---
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            changePage(link.dataset.page);
        });
    });

    themeToggle.addEventListener('change', () => document.body.classList.toggle('dark-mode'));

    connectBtn.addEventListener('click', async () => {
        setConnectionStatus('Conectando...');
        connectBtn.disabled = true;
        qrStatusMessage.textContent = 'Aguardando geração do QR Code...';
        qrCodeImage.classList.add('hidden');
        await window.electronAPI.connectWhatsapp();
    });

    disconnectBtn.addEventListener('click', async () => {
        logMessage('Desconectando...', 'info');
        disconnectBtn.disabled = true;
        wasConnected = false;
        const result = await window.electronAPI.disconnectWhatsapp();
        if (result.success) {
            logMessage('Desconectado com sucesso.', 'success');
        } else {
            logMessage(`Erro ao desconectar: ${result.error}`, 'error');
            disconnectBtn.disabled = false;
        }
    });

    prepareBtn.addEventListener('click', async () => {
        logMessage('Aguardando seleção do arquivo...', 'info');
        const result = await window.electronAPI.prepareAndReadExcel();
        if (result.success) {
            logMessage(result.message, 'success');
            startSendBtn.disabled = false;
            prepareBtn.disabled = true;
        } else {
            logMessage(`Falha ao preparar: ${result.error}`, 'error');
        }
    });

    startSendBtn.addEventListener('click', async () => {
        const message = messageInput.value;
        const delay = parseInt(delayInput.value) * 1000;
        if (!message.trim()) {
            logMessage('Erro: Por favor, digite a mensagem a ser enviada.', 'error');
            return;
        }
        startSendBtn.disabled = true;
        logMessage('Buscando contatos no banco de dados...', 'info');
        try {
            const contacts = await window.electronAPI.getContactsFromDb();
            if (contacts.length === 0) {
                logMessage('Nenhum contato com status "Preparado" encontrado no banco de dados.', 'info');
                return;
            }
            logMessage(`Iniciando disparo para ${contacts.length} contatos.`, 'info');
            for (const contact of contacts) {
                const personalizedMessage = message.replace(/{nome}/gi, contact.name);
                logMessage(`Enviando para ${contact.name} (${contact.phone})...`, 'info');
                const sendResult = await window.electronAPI.sendWhatsappMessage({ number: contact.phone, message: personalizedMessage });
                if (sendResult.success) {
                    logMessage(`Mensagem enviada para ${contact.name}.`, 'success');
                    await window.electronAPI.updateStatus({ phone: contact.phone, status: 'Enviado' });
                } else {
                    logMessage(`Falha ao enviar para ${contact.name}: ${sendResult.error}`, 'error');
                    await window.electronAPI.updateStatus({ phone: contact.phone, status: 'Falha' });
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            logMessage('Disparo concluído!', 'success');
        } catch (error) {
            logMessage(`Ocorreu um erro no processo de disparo: ${error.message}`, 'error');
        } finally {
            startSendBtn.disabled = false;
            prepareBtn.disabled = false;
        }
    });

    // --- RECEPTORES DE EVENTOS DO BACKEND ---
    window.electronAPI.onQrCode((qr) => {
        qrStatusMessage.textContent = 'Por favor, escaneie o QR Code com seu celular:';
        QRCode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error('Erro ao gerar QR Code:', err);
                qrStatusMessage.textContent = 'Erro ao gerar QR Code.';
                return;
            }
            qrCodeImage.src = url;
            qrCodeImage.classList.remove('hidden');
        });
    });

    window.electronAPI.onConnectionStatus((status) => {
        setConnectionStatus(status);
        if (status === 'Conectado') {
            wasConnected = true;
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            qrCodeContainer.classList.add('hidden');
            qrStatusMessage.textContent = 'Você está conectado!';
        } else if (status === 'Conectando...') {
            connectBtn.disabled = true;
            disconnectBtn.disabled = true;
        } else {
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            qrCodeContainer.classList.remove('hidden');
            qrCodeImage.classList.add('hidden');
            qrStatusMessage.textContent = '';
            if (wasConnected) {
                console.error('CONEXÃO PERDIDA: A conexão com o WhatsApp foi perdida.');
                wasConnected = false;
            }
        }
    });

    // --- INICIALIZAÇÃO ---
    changePage('dashboard');
});