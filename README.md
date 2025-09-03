# disp_whtas

Um aplicativo de desktop para automatizar o envio de mensagens do WhatsApp em massa, construído com Electron e Node.js.

## Funcionalidades

- **Gerenciamento de Sessões:** Conecte uma ou mais contas do WhatsApp e gerencie as sessões ativas.
- **Importação de Contatos:** Carregue contatos a partir de planilhas Excel (`.xlsx`).
- **Envio em Massa:** Envie mensagens personalizadas para a lista de contatos importada.
- **Acompanhamento de Status:** Monitore o status de envio para cada contato (Preparado, Enviado, Falhou).

## Como Usar em Outra Máquina

Para configurar e executar este projeto em um novo computador, siga os passos abaixo.

### Pré-requisitos

- [Node.js](https://nodejs.org/) (que inclui o npm) instalado.

### Passos de Instalação

1. **Clone o Repositório:**
   Abra um terminal ou prompt de comando e clone o projeto a partir do GitHub.

   ```bash
   git clone https://github.com/Guzinn01/disp_whtas.git
   ```

2. **Acesse a Pasta do Projeto:**

   ```bash
   cd disp_whtas
   ```

3. **Instale as Dependências:**
   Execute o comando abaixo para instalar todas as bibliotecas necessárias para o projeto.

   ```bash
   npm install
   ```

4. **Inicie o Aplicativo:**
   Após a instalação das dependências, inicie o aplicativo com o seguinte comando:

   ```bash
   npm start
   ```

Ao iniciar, a janela principal do aplicativo será aberta e você poderá começar a adicionar sessões do WhatsApp e importar seus contatos.
