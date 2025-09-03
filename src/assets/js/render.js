document.addEventListener('DOMContentLoaded', () => {
    console.log('AVISO: A versão do render.js com a correção do path do arquivo foi carregada.');

    // --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
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

    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    const themeToggle = document.getElementById('theme-toggle');

    // A variável global excelFilePath foi removida, pois não é mais necessária

    // --- FUNÇÕES AUXILIARES ---
    const setConnectionStatus = (status) => {
        connectionStatusText.textContent = status;
        connectionStatusDiv.className = `status-${status.toLowerCase().replace(' ', '-')}`;
    };

    const showModal = (title, message) => {
        console.error(`MODAL: ${title} - ${message}`);
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

    // --- LÓGICA DE NAVEGAÇÃO E TEMA ---
    const changePage = (pageId) => {
        pages.forEach(page => page.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === pageId) link.classList.add('active');
        });
    };

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            changePage(link.dataset.page);
        });
    });

    themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode');
    });

    // --- EVENT LISTENERS PRINCIPAIS ---
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
        const result = await window.electronAPI.disconnectWhatsapp();
        if (result.success) {
            logMessage('Desconectado com sucesso.', 'success');
        } else {
            logMessage(`Erro ao desconectar: ${result.error}`, 'error');
            disconnectBtn.disabled = false;
        }
    });

    // --- EVENTOS RECEBIDOS DO BACKEND (main.js) ---
    window.electronAPI.onQrCode((qr) => {
        qrStatusMessage.textContent = 'Por favor, escaneie o QR Code com seu celular:';
        QRCode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error('Erro ao gerar QR Code:', err);
                qrStatusMessage.textContent = 'Erro ao gerar QR Code. Tente novamente.';
                return;
            }
            qrCodeImage.src = url;
            qrCodeImage.classList.remove('hidden');
        });
    });

    let wasConnected = false;
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
        } else { // Desconectado
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

    // --- LÓGICA DE DISPARO ---

    // ****** ESTA É A PARTE QUE FOI ALTERADA ******
    prepareBtn.addEventListener('click', async () => {
        if (!fileInput.files.length) {
            showModal('Erro', 'Por favor, selecione um arquivo Excel.');
            return;
        }
        // Pega o caminho diretamente do elemento de input
        const filePath = fileInput.files[0].path;
        logMessage('Preparando a planilha...', 'info');

        // Envia o caminho para o main.js
        const result = await window.electronAPI.readAndPrepareExcel(filePath);

        if (result.success) {
            logMessage('Planilha preparada com sucesso!', 'success');
            startSendBtn.disabled = false;
            prepareBtn.disabled = true;
        } else {
            showModal('Erro ao Preparar', `Erro: ${result.error}`);
        }
    });

    startSendBtn.addEventListener('click', async () => {
        const message = messageInput.value;
        const delay = parseInt(delayInput.value) * 1000;
        if (!message.trim()) {
            showModal('Erro', 'Por favor, digite a mensagem a ser enviada.');
            return;
        }
        // Pega o caminho novamente para garantir que está correto
        if (!fileInput.files.length) {
            showModal('Erro', 'Nenhum arquivo selecionado. Prepare a planilha primeiro.');
            return;
        }
        const filePath = fileInput.files[0].path;

        startSendBtn.disabled = true;
        logMessage('Iniciando o disparo...', 'info');
        try {
            // Usa a variável local 'filePath' em vez da global
            const result = await window.electronAPI.readAndPrepareExcel(filePath);
            if (!result.success) {
                logMessage(`Erro ao ler a planilha: ${result.error}`, 'error');
                return;
            }
            const pendingContacts = result.data.filter(contact => contact.status === 'Pendente');
            if (pendingContacts.length === 0) {
                logMessage('Nenhum contato pendente encontrado.', 'info');
                return;
            }
            for (const contact of pendingContacts) {
                const personalizedMessage = message.replace(/{nome}/g, contact.nome);
                logMessage(`Enviando para ${contact.nome}...`, 'info');
                const sendResult = await window.electronAPI.sendWhatsappMessage({ number: contact.telefone, message: personalizedMessage });
                if (sendResult.success) {
                    logMessage(`Mensagem enviada para ${contact.nome}.`, 'success');
                    await window.electronAPI.updateStatus({ filePath: filePath, telefone: contact.telefone, status: 'Enviado' });
                } else {
                    logMessage(`Falha ao enviar para ${contact.nome}: ${sendResult.error}`, 'error');
                    await window.electronAPI.updateStatus({ filePath: filePath, telefone: contact.telefone, status: 'Falha' });
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            logMessage('Disparo concluído!', 'success');
        } catch (error) {
            logMessage(`Ocorreu um erro no processo de disparo: ${error.message}`, 'error');
        } finally {
            startSendBtn.disabled = false;
        }
    });

    // --- INICIALIZAÇÃO ---
    changePage('dashboard');
});

