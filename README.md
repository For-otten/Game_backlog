# Checkpoint — Game Backlog

Interface web para gerenciar uma biblioteca de jogos armazenada no Google Sheets. A versão 2 separa apresentação, comportamento e integração com a planilha, além de trocar o antigo `onEdit` simulado por operações diretas e atômicas.

## Estrutura

```text
index.html                         Estrutura semântica da interface
css/styles.css                     Identidade visual e responsividade
js/api.js                          Configuração, cache e comunicação com Apps Script
js/ui.js                           Componentes e renderização da biblioteca
js/app.js                          Estado, eventos e regras da interface
google-apps-script/Api.gs          CRUD seguro e leitura da planilha
google-apps-script/Code.gs         Integrações Steam, Xbox, IGDB e menu existente
google-apps-script/FormularioAdicionarJogo.html
                                   Formulário usado dentro do Google Sheets
```

## Atualizar o Google Apps Script

1. Abra **Extensões → Apps Script** na planilha.
2. Substitua o conteúdo do projeto pelos três arquivos da pasta `google-apps-script`. Crie cada arquivo com o mesmo nome.
3. Salve e execute `gerarTokenAPI` uma vez, ou use **Backlog → Gerar/Ver token da API**.
4. Em **Implantar → Gerenciar implantações**, publique uma **nova versão** do app da Web. Execute como você e selecione **Qualquer pessoa** em “Quem pode acessar”. O token protege as operações da API.
5. Copie a URL terminada em `/exec` e informe-a, junto com o token, em **Configurar** no site.

O backend pressupõe estes pontos de início, iguais aos códigos recebidos:

- backlog na linha 2 da aba `Lista de Jogos`;
- concluídos e platinando na linha 3 da aba `Jogos Concluídos`;
- dropados na linha 2 da aba `Dropados`.

Se os nomes ou linhas forem diferentes, ajuste apenas o objeto `GAME_DB` no topo de `Api.gs`.

## Executar localmente

É necessário ter Node.js instalado.

```bash
npm run check
npm run dev
```

Abra `http://127.0.0.1:4173`. Não abra `index.html` diretamente pelo explorador, porque os módulos JavaScript precisam ser servidos por HTTP.

## O que mudou no fluxo de dados

- Inclusão usa a aba principal explicitamente; não depende mais da aba que estiver aberta.
- Edição de nome, plataforma e interesse acontece em uma única requisição.
- Antes de alterar uma linha, o backend confere se o jogo ainda está nela.
- Os índices retornados pela API agora preservam a linha física real, inclusive quando existem espaços vazios.
- As tabelas esquerda e direita de `Jogos Concluídos` são movimentadas de forma independente, sem apagar a linha inteira.
- Platinados têm coleção e seção próprias; registros com marcador `Platinado` ou 100% são classificados corretamente.
- Todas as mutações usam `LockService`, evitando duas operações concorrentes na mesma planilha.

## Segurança

Não versione tokens nem chaves de provedores. As configurações digitadas no site ficam no armazenamento local do navegador. Para uso público ou compartilhado, o ideal é mover também as chaves de capas para as propriedades do Apps Script.

Se um token aparecer em logs, prints ou mensagens, use **Backlog → Regenerar token da API** e atualize o valor no site.
