// renderer.js

// Referências para os elementos do DOM
const prepareBtn = document.getElementById('prepare-btn'); // Novo botão
const startSendBtn = document.getElementById('start-send-btn');
const fileInput = document.getElementById('file-upload');
const messageInput = document.getElementById('message-input');
const delayInput = document.getElementById('delay-input');
const messageLog = document.getElementById('message-log');

let excelFilePath = null;

// Evento de clique no botão de "Preparar Disparo"
prepareBtn.addEventListener('click', async () => {
    if (!fileInput.files.length) {
        logMessage('Por favor, selecione um arquivo Excel.', 'error');
        return;
    }

    excelFilePath = fileInput.files[0].path;
    logMessage('Preparando a planilha. Por favor, aguarde...');

    // Chama a função exposta pelo preload para ler e preparar a planilha
    const result = await window.electronAPI.readAndPrepareExcel(excelFilePath);

    if (result.success) {
        logMessage('Planilha preparada com sucesso! Status "Pendente" adicionado.', 'success');
        startSendBtn.disabled = false; // Habilita o botão de iniciar disparo
        prepareBtn.disabled = true;
    } else {
        logMessage(`Erro ao preparar a planilha: ${result.error}`, 'error');
    }
});

// Evento de clique no botão de "Iniciar Disparo"
startSendBtn.addEventListener('click', () => {
    const message = messageInput.value;
    const delay = delayInput.value;

    if (!message.trim()) {
        logMessage('Por favor, digite a mensagem a ser enviada.', 'error');
        return;
    }

    if (!excelFilePath) {
        logMessage('Por favor, prepare a planilha antes de iniciar o disparo.', 'error');
        return;
    }

    logMessage('Iniciando o disparo de mensagens...');
    // A lógica real de envio de mensagens será implementada aqui.
});

// Função para registrar mensagens no log da interface
function logMessage(text, type = 'info') {
    const p = document.createElement('p');
    p.textContent = text;
    p.classList.add(type);
    messageLog.appendChild(p);
    messageLog.scrollTop = messageLog.scrollHeight;
}

startSendBtn.addEventListener('click', async () => {
    const message = messageInput.value;
    const delay = parseInt(delayInput.value) * 1000; // Converte segundos para milissegundos

    if (!message.trim()) {
        logMessage('Por favor, digite a mensagem a ser enviada.', 'error');
        return;
    }

    if (!excelFilePath) {
        logMessage('Por favor, prepare a planilha antes de iniciar o disparo.', 'error');
        return;
    }

    // Desabilita os botões para evitar cliques durante o disparo
    startSendBtn.disabled = true;
    messageInput.disabled = true;
    delayInput.disabled = true;
    fileInput.disabled = true;

    logMessage('Iniciando o disparo de mensagens. Não feche esta janela.', 'info');

    try {
        // Re-lê a planilha para pegar os dados preparados
        const result = await window.electronAPI.readAndPrepareExcel(excelFilePath);

        if (!result.success) {
            logMessage(`Erro ao ler a planilha: ${result.error}`, 'error');
            return;
        }

        // Filtra apenas os contatos com status "Pendente"
        const pendingContacts = result.data.filter(contact => contact.status === 'Pendente');

        if (pendingContacts.length === 0) {
            logMessage('Nenhum contato com status "Pendente" encontrado.', 'info');
            return;
        }

        for (const contact of pendingContacts) {
            const personalizedMessage = message.replace(/{nome}/g, contact.nome);
            const phoneNumber = contact.telefone;

            logMessage(`Enviando mensagem para ${contact.nome}...`, 'info');

            // Simulação de envio da mensagem (você pode substituir por uma API real)
            // Lógica para enviar a mensagem para o número aqui
            await new Promise(resolve => setTimeout(resolve, delay));

            // Notifica o backend para atualizar o status na planilha
            await window.electronAPI.updateStatus({
                filePath: excelFilePath,
                telefone: phoneNumber,
                status: 'Enviado'
            });

            logMessage(`Mensagem enviada para ${contact.nome}.`, 'success');
        }

        logMessage('Disparo concluído! Todas as mensagens pendentes foram enviadas.', 'success');

    } catch (error) {
        logMessage(`Ocorreu um erro no processo de disparo: ${error.message}`, 'error');
    } finally {
        // Habilita os botões novamente
        startSendBtn.disabled = false;
        prepareBtn.disabled = false;
        messageInput.disabled = false;
        delayInput.disabled = false;
        fileInput.disabled = false;
    }
});