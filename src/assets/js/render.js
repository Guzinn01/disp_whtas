document.addEventListener('DOMContentLoaded', () => {
    // --- REFERÊNCIAS PARA A INTERFACE DE SESSÕES ---
    const addSessionBtn = document.getElementById('add-session-btn');
    const newSessionQrContainer = document.getElementById('new-session-qr-container');
    const qrCodeWrapper = document.getElementById('qr-code-wrapper');
    const qrStatusMessage = document.getElementById('qr-status-message');
    const cancelAddSessionBtn = document.getElementById('cancel-add-session-btn');
    const sessionSelector = document.getElementById('session-selector');
    const delayMinInput = document.getElementById('delay-min-input');
    const delayMaxInput = document.getElementById('delay-max-input');
    const pauseSendBtn = document.getElementById('pause-send-btn');
    const cancelSendBtn = document.getElementById('cancel-send-btn');

    // --- Novas referências para o formulário de adicionar conta ---
    const addSessionFormContainer = document.getElementById('add-session-form-container');
    const sessionNameInput = document.getElementById('session-name-input');
    const confirmAddSessionBtn = document.getElementById('confirm-add-session-btn');
    const cancelAddFormBtn = document.getElementById('cancel-add-form-btn');

    // --- REFERÊNCIAS PARA DISPARO E OUTROS ---
    const prepareBtn = document.getElementById('prepare-btn');
    const startSendBtn = document.getElementById('start-send-btn');
    const messageInput = document.getElementById('message-input');
    const messageLog = document.getElementById('message-log');
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    const themeToggle = document.getElementById('theme-toggle');

    // --- Variável para controlar o estado das conexões em tempo real ---
    let liveSessions = new Set();
    let isPaused = false;
    let shouldCancel = false;

    // --- FUNÇÕES AUXILIARES ---
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

    // --- LÓGICA DE GERENCIAMENTO DE SESSÕES ---
    const renderSessions = (sessions) => {
        const tableBody = document.getElementById('sessions-table-body');
        sessionSelector.innerHTML = '';
        tableBody.innerHTML = '';

        if (sessions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma conta salva.</td></tr>';
            sessionSelector.innerHTML = '<option value="">Nenhuma conta conectada</option>';
            return;
        }

        let hasLiveSessionForSelector = false;
        sessions.forEach(session => {
            const row = tableBody.insertRow();
            row.id = `session-${session.sessionId}`;

            const cellName = row.insertCell(0);
            const cellNumber = row.insertCell(1);
            const cellActions = row.insertCell(2);

            cellName.textContent = session.sessionName;
            cellNumber.textContent = session.phoneNumber || 'Sessão Pendente';

            const isLive = liveSessions.has(session.sessionId);

            if (isLive) {
                cellActions.innerHTML = `
                    <button class="success" disabled>CONECTADO</button>
                    <button class="danger remove-session-btn" data-session-id="${session.sessionId}">Remover</button>
                `;
                const optionElement = document.createElement('option');
                optionElement.value = session.sessionId;
                optionElement.textContent = `${session.sessionName} (${session.phoneNumber})`;
                sessionSelector.appendChild(optionElement);
                hasLiveSessionForSelector = true;
            } else {
                cellActions.innerHTML = `
                    <button class="primary reconnect-session-btn" data-session-id="${session.sessionId}">Reconectar</button>
                    <button class="danger remove-session-btn" data-session-id="${session.sessionId}">Remover</button>
                `;
            }
        });

        if (!hasLiveSessionForSelector) {
            sessionSelector.innerHTML = '<option value="">Nenhuma conta conectada</option>';
        }

        document.querySelectorAll('.remove-session-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const sessionId = event.target.dataset.sessionId;
                liveSessions.delete(sessionId);
                await window.electronAPI.removeSession(sessionId);
                loadSessions();
            });
        });

        document.querySelectorAll('.reconnect-session-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const sessionId = event.target.dataset.sessionId;
                button.textContent = 'CONECTANDO...';
                button.disabled = true;
                await window.electronAPI.reconnectSession(sessionId);
            });
        });
    };

    const loadSessions = async () => {
        const sessions = await window.electronAPI.getSessions();
        renderSessions(sessions);
    };

    // --- EVENTOS DA INTERFACE ---
    navLinks.forEach(link => link.addEventListener('click', (e) => { e.preventDefault(); changePage(link.dataset.page); }));
    themeToggle.addEventListener('change', () => document.body.classList.toggle('dark-mode'));

    addSessionBtn.addEventListener('click', () => {
        addSessionFormContainer.classList.remove('hidden');
    });

    cancelAddFormBtn.addEventListener('click', () => {
        addSessionFormContainer.classList.add('hidden');
        sessionNameInput.value = '';
    });

    confirmAddSessionBtn.addEventListener('click', async () => {
        const sessionName = sessionNameInput.value;
        if (sessionName && sessionName.trim() !== "") {
            addSessionFormContainer.classList.add('hidden');
            newSessionQrContainer.classList.remove('hidden');
            qrStatusMessage.textContent = 'Gerando ID da sessão...';
            qrCodeWrapper.innerHTML = '';
            await window.electronAPI.addNewSession(sessionName.trim());
            sessionNameInput.value = '';
        } else {
            alert('Por favor, digite um nome para a conta.');
        }
    });

    cancelAddSessionBtn.addEventListener('click', () => {
        newSessionQrContainer.classList.add('hidden');
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
        const sessionId = sessionSelector.value;
        const message = messageInput.value;
        const minDelay = parseInt(delayMinInput.value) * 1000;
        const maxDelay = parseInt(delayMaxInput.value) * 1000;

        if (!sessionId) { logMessage('Erro: Nenhuma conta conectada selecionada.', 'error'); return; }
        if (!message.trim()) { logMessage('Erro: Digite a mensagem.', 'error'); return; }
        if (minDelay > maxDelay) { logMessage('Erro: O atraso mínimo não pode ser maior que o máximo.', 'error'); return; }

        // --- Prepara a interface e os controles para o início do disparo ---
        startSendBtn.disabled = true;
        prepareBtn.disabled = true;
        pauseSendBtn.classList.remove('hidden');
        cancelSendBtn.classList.remove('hidden');
        isPaused = false;
        shouldCancel = false;
        pauseSendBtn.textContent = '⏸ Pausar Disparo';

        logMessage('Buscando contatos no DB...', 'info');
        try {
            const contacts = await window.electronAPI.getContactsFromDb();
            if (contacts.length === 0) { logMessage('Nenhum contato "Preparado" encontrado.', 'info'); return; }

            logMessage(`Iniciando disparo com a conta ${sessionSelector.options[sessionSelector.selectedIndex].text} para ${contacts.length} contatos.`, 'info');

            for (const contact of contacts) {
                // --- VERIFICAÇÃO DE PAUSA ---
                while (isPaused) {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Espera 0.5s antes de checar de novo
                }

                // --- VERIFICAÇÃO DE CANCELAMENTO ---
                if (shouldCancel) {
                    logMessage('Disparo cancelado pelo usuário.', 'info');
                    break; // Sai do loop 'for'
                }

                const personalizedMessage = message.replace(/{nome}/gi, contact.name).replace(/{name}/gi, contact.name);
                logMessage(`Enviando para ${contact.name}...`, 'info');
                const sendResult = await window.electronAPI.sendWhatsappMessage({ sessionId, number: contact.phone, message: personalizedMessage });

                if (sendResult.success) {
                    logMessage(`Mensagem enviada para ${contact.name}.`, 'success');
                    await window.electronAPI.updateStatus({ phone: contact.phone, status: 'Enviado' });
                } else {
                    logMessage(`Falha ao enviar para ${contact.name}: ${sendResult.error}`, 'error');
                    await window.electronAPI.updateStatus({ phone: contact.phone, status: 'Falha' });
                }

                // --- LÓGICA DO ATRASO VARIÁVEL ---
                const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                logMessage(`Aguardando ${randomDelay / 1000} segundos...`, 'timer');
                await new Promise(resolve => setTimeout(resolve, randomDelay));
            }

            if (!shouldCancel) {
                logMessage('Disparo concluído!', 'success');
            }

        } catch (error) {
            logMessage(`Erro no disparo: ${error.message}`, 'error');
        } finally {
            // --- Restaura a interface ao estado inicial ---
            startSendBtn.disabled = false;
            prepareBtn.disabled = false;
            pauseSendBtn.classList.add('hidden');
            cancelSendBtn.classList.add('hidden');
            isPaused = false;
            shouldCancel = false;
        }
    });

    // --- RECEPTORES DE EVENTOS DO BACKEND ---
    window.electronAPI.onSessionQrCode(({ sessionId, qr }) => {
        qrStatusMessage.textContent = `Escaneie para conectar:`;
        QRCode.toDataURL(qr, (err, url) => {
            if (err) return;
            qrCodeWrapper.innerHTML = `<img src="${url}" alt="QR Code">`;
        });
    });

    window.electronAPI.onSessionReady(({ sessionId }) => {
        newSessionQrContainer.classList.add('hidden');
        logMessage('Conta conectada!', 'success');
        liveSessions.add(sessionId);
        loadSessions();
    });

    window.electronAPI.onSessionDisconnected((sessionId) => {
        logMessage('Uma conta foi desconectada.', 'info');
        liveSessions.delete(sessionId);
        loadSessions();
    });

    window.electronAPI.onSessionRemoved((sessionId) => {
        logMessage('Uma sessão inválida foi removida.', 'info');
        liveSessions.delete(sessionId);
        loadSessions();
    });

    pauseSendBtn.addEventListener('click', () => {
        isPaused = !isPaused; // Inverte o estado de pausa
        if (isPaused) {
            pauseSendBtn.textContent = '▶️ Retomar Disparo';
            logMessage('Disparo pausado pelo usuário.', 'info');
        } else {
            pauseSendBtn.textContent = '⏸ Pausar Disparo';
            logMessage('Disparo retomado.', 'info');
        }
    });

    cancelSendBtn.addEventListener('click', () => {
        shouldCancel = true;
        logMessage('Cancelamento solicitado. O disparo será interrompido após a mensagem atual.', 'warning');
    });


    // --- INICIALIZAÇÃO ---
    changePage('dashboard');
    loadSessions();
});