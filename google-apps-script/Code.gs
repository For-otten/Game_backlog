function onEditLegacy_(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = e.range;

  // ------------ Lógica para mover conteúdo da tabela direita para a esquerda -------------------
  if (range.getColumn() == 11) {
    var row = range.getRow();

    if (e.value === "TRUE" || e.value === true) {
      var nome = sheet.getRange(row, 7).getValue();
      var plataforma = sheet.getRange(row, 8).getValue();
      var trofeus = sheet.getRange(row, 10).getValue();

      var targetRange = sheet.getRange("A2:E" + sheet.getLastRow());
      var targetValues = targetRange.getValues();
      var nextRow = targetValues.findIndex(function(r) { return r[0] === ""; }) + 2;
      if (nextRow === 1) nextRow = sheet.getLastRow() + 1;

      var today = new Date();
      var formattedDate = Utilities.formatDate(today, "GMT-3", "dd/MM/yyyy HH:mm:ss");

      sheet.getRange(nextRow, 1, 1, 4).setValues([[nome, plataforma, formattedDate, trofeus]]);
      sheet.getRange(nextRow, 1, 1, 5).setBorder(true, true, true, true, false, false, "#0000FF", SpreadsheetApp.BorderStyle.SOLID);

      var checkboxCell = sheet.getRange(nextRow, 5);
      checkboxCell.setValue("Platinado");
      checkboxCell.clearDataValidations();
      checkboxCell.setFontSize(12);

      sheet.getRange(row, 7, 1, 5).clearContent();
    }
  }

  // ---------- Nível de Interesse: Dropei + Ordenação com mais recente no topo do grupo ------------------
  if (range.getColumn() == 3 && sheet.getName() !== "Dropados") {
    var row = range.getRow();
    var newValue = e.value ? e.value.toString().toLowerCase().trim() : '';

    // --- Lógica do "Dropei": mover jogo para a folha Dropados ---
    if (newValue === 'dropei') {
      var gameName = sheet.getRange(row, 1).getValue();

      var today = new Date();
      var formattedDate = Utilities.formatDate(today, "GMT-3", "dd/MM/yyyy HH:mm:ss");

      var plataforma = sheet.getRange(row, 2).getValue();

      var dropSheet = e.source.getSheetByName("Dropados");
      if (!dropSheet) {
        dropSheet = e.source.insertSheet("Dropados");
        var header = dropSheet.getRange(1, 1, 1, 4);
        header.setValues([["Nome do Jogo", "Plataforma", "Data de Drop", "Voltar?"]]);
        header.setFontWeight("bold");
        dropSheet.setColumnWidth(1, 200);
        dropSheet.setColumnWidth(2, 120);
        dropSheet.setColumnWidth(3, 160);
        dropSheet.setColumnWidth(4, 100);
      }

      // Insere sempre na linha 2 (topo da lista, logo abaixo do cabeçalho)
      dropSheet.insertRowBefore(2);
      dropSheet.getRange(2, 1, 1, 3).setValues([[gameName, plataforma, formattedDate]]);
      dropSheet.getRange(2, 4).insertCheckboxes();

      // Remove da lista principal e adiciona linha vazia no fim
      sheet.deleteRow(row);
      sheet.appendRow(["", "", "", "", ""]);
      return; // Encerra aqui, não continua para a lógica de ordenação
    }

    // --- Ordenação: mais recente no topo do grupo ---
    ordenarPorNivelInteresse(sheet, row);
  }

  // ---------- Lógica para mover jogos concluídos e adicionar a data ----------------
  var statusColumn = 4;
  var targetSheetName = "Jogos Concluídos";

  // FIX: Garante que esta lógica só roda na lista principal, nunca em "Dropados"
  if (range.getColumn() == statusColumn && e.value == "TRUE" && sheet.getName() !== "Dropados") {
    var row = range.getRow();
    var gameData = sheet.getRange(row, 1, 1, 2).getValues();

    var today = new Date();
    var formattedDate = Utilities.formatDate(today, "GMT-3", "dd/MM/yyyy HH:mm:ss");
    gameData[0].push(formattedDate);

    var targetSheet = e.source.getSheetByName(targetSheetName);
    if (!targetSheet) {
      targetSheet = e.source.insertSheet(targetSheetName);
      targetSheet.appendRow(["Nome do Jogo", "Plataforma", "Data de Conclusão", "", "", "", "Nome do Jogo (Platinando)", "Plataforma", "Data", "Troféus", "Checkbox"]);
    }

    var lastRow = targetSheet.getLastRow();
    var rangeToCheck = targetSheet.getRange(3, 1, Math.max(lastRow - 2, 1), 7).getValues();

    var nextRow = 3;
    for (var i = 0; i < rangeToCheck.length; i++) {
      var colA = rangeToCheck[i][0];
      var colG = rangeToCheck[i][6];
      if ((colA === "" || colA === null) && (colG === "" || colG === null)) {
        nextRow = i + 3;
        break;
      }
    }

    if (nextRow === 3 && rangeToCheck.length > 0) {
      nextRow = lastRow + 1;
    }

    targetSheet.getRange(nextRow, 1, 1, gameData[0].length).setValues(gameData);

    sheet.deleteRow(row);
    sheet.appendRow(["", "", "", ""]);
  }

  // ---------- Lógica para mover conteúdo da tabela da esquerda para a direita ao marcar o checkbox na coluna E ------------------
  if (range.getColumn() == 5) {
    var row = range.getRow();

    if (e.value === "TRUE" || e.value === true) {
      var gameData = sheet.getRange(row, 1, 1, 1).getValues();
      var plataforma = sheet.getRange(row, 2, 1, 1).getValues();
      var trofeus = sheet.getRange(row, 4, 1, 1).getValues();

      var today = new Date();
      var formattedDate = Utilities.formatDate(today, "GMT-3", "dd/MM/yyyy HH:mm:ss");

      sheet.getRange(row, 9).setValue(formattedDate);
      sheet.getRange(row, 7).setValue(gameData[0][0]);
      sheet.getRange(row, 8).setValue(plataforma[0][0]);
      sheet.getRange(row, 10).setValue(trofeus[0][0]);

      sheet.getRange(row, 1, 1, 5).clearContent();
      sheet.appendRow(["", "", "", "", ""]);
    }
  }

  // ---------- Lógica para "Voltar?" — devolver jogo da folha Dropados para a lista principal ------------------
  // Checkbox "Voltar?" está na coluna 4 (Nome | Plataforma | Data | Voltar?)
  if (sheet.getName() === "Dropados" && range.getColumn() == 4 && e.value === "TRUE") {
    var row = range.getRow();
    var gameName = sheet.getRange(row, 1).getValue();
    var plataformaDropada = sheet.getRange(row, 2).getValue();

    // Encontra a folha "Lista de Jogos" (primeira que não for especial)
    var mainSheet = null;
    var allSheets = e.source.getSheets();
    var specialSheets = ["Jogos Concluídos", "Dropados"];
    for (var i = 0; i < allSheets.length; i++) {
      if (specialSheets.indexOf(allSheets[i].getName()) === -1) {
        mainSheet = allSheets[i];
        break;
      }
    }

    if (mainSheet) {
      var mainLastRow = mainSheet.getLastRow();
      var nextMainRow = mainLastRow + 1;
      if (mainLastRow >= 2) {
        var mainColA = mainSheet.getRange("A2:A" + mainLastRow).getValues();
        for (var i = 0; i < mainColA.length; i++) {
          if (mainColA[i][0] === "" || mainColA[i][0] === null) {
            nextMainRow = i + 2;
            break;
          }
        }
      }

      // Devolve nome e plataforma — nível de interesse o usuário define depois
      mainSheet.getRange(nextMainRow, 1).setValue(gameName);
      mainSheet.getRange(nextMainRow, 2).setValue(plataformaDropada);
    }

    // Remove da folha Dropados
    sheet.deleteRow(row);
  }
}

// ======================================================================
// ORDENAÇÃO POR NÍVEL DE INTERESSE (extraído para ser reaproveitado
// tanto pela edição manual da coluna C quanto pelo formulário de
// adicionar jogo novo)
// ======================================================================
var ORDEM_NIVEL = { "alto": 0, "médio": 1, "medio": 1, "baixo": 2, "ㅤ": 3, "": 4 };

function nivelParaOrdem(nivel) {
  var n = nivel ? nivel.toString().toLowerCase().trim() : '';
  return (ORDEM_NIVEL[n] !== undefined) ? ORDEM_NIVEL[n] : 5;
}

function ordenarPorNivelInteresse(sheet, row) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Lê apenas 4 colunas (A:D) para não sobrescrever checkboxes da col E
  var numCols = 4;
  var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  var editedRowIndex = row - 2; // Índice 0-based no array

  // Guarda os dados da linha editada e remove do array
  var editedRowData = data[editedRowIndex];
  data.splice(editedRowIndex, 1);

  // Ordena as linhas restantes por nível de interesse
  data.sort(function(a, b) {
    return nivelParaOrdem(a[2]) - nivelParaOrdem(b[2]);
  });

  // Encontra o topo do grupo do item editado para inseri-lo lá
  var editedOrder = nivelParaOrdem(editedRowData[2]);

  var insertIndex = data.length;
  for (var i = 0; i < data.length; i++) {
    if (nivelParaOrdem(data[i][2]) >= editedOrder) {
      insertIndex = i;
      break;
    }
  }

  // Insere a linha editada no topo do seu grupo
  data.splice(insertIndex, 0, editedRowData);

  // Escreve de volta apenas as 4 colunas — checkboxes (col E) ficam intactos
  sheet.getRange(2, 1, data.length, numCols).setValues(data);
}

// ======================================================================
// MENU CUSTOMIZADO + FORMULÁRIO DE ADICIONAR JOGO
// ======================================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Backlog')
    .addItem('Adicionar jogo', 'showAddGameForm')
    .addItem('Definir URL ativa do app', 'configurarUrlWebApp')
    .addItem('Ver URL de conexão', 'gerarTokenAPI')
    .addItem('Regenerar token da API', 'regenerarTokenAPI')
    .addToUi();
}

function showAddGameForm() {
  var html = HtmlService.createHtmlOutputFromFile('FormularioAdicionarJogo')
    .setWidth(420)
    .setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, 'Adicionar Novo Jogo');
}

// Lê as plataformas já existentes na coluna B para popular o select do formulário
function getPlataformasExistentesLegacy_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // coluna B
  var plataformasSet = {};
  values.forEach(function(r) {
    var p = r[0] ? r[0].toString().trim() : '';
    if (p) plataformasSet[p] = true;
  });
  return Object.keys(plataformasSet).sort();
}

// Chamada pelo formulário HTML para inserir o jogo já na posição correta
function adicionarJogoBacklogLegacy_(dados) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var nome = dados.nome ? dados.nome.toString().trim() : '';
  var plataforma = dados.plataforma ? dados.plataforma.toString().trim() : '';
  var nivel = dados.nivel ? dados.nivel.toString().trim() : '';

  if (!nome) throw new Error('O nome do jogo é obrigatório.');
  if (!plataforma) throw new Error('A plataforma é obrigatória.');

  var lastRow = sheet.getLastRow();
  var numCols = 4;
  var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, numCols).getValues() : [];

  // Remove linhas totalmente vazias do fim para não acumular lixo
  while (data.length > 0 && !data[data.length - 1][0]) {
    data.pop();
  }

  var novaLinha = [nome, plataforma, nivel, ''];
  var novaOrdem = nivelParaOrdem(nivel);

  var insertIndex = data.length;
  for (var i = 0; i < data.length; i++) {
    if (nivelParaOrdem(data[i][2]) >= novaOrdem) {
      insertIndex = i;
      break;
    }
  }

  data.splice(insertIndex, 0, novaLinha);

  // Garante linhas suficientes na planilha
  var linhasNecessarias = data.length + 1; // +1 pelo cabeçalho
  if (sheet.getMaxRows() < linhasNecessarias) {
    sheet.insertRowsAfter(sheet.getMaxRows(), linhasNecessarias - sheet.getMaxRows());
  }

  sheet.getRange(2, 1, data.length, numCols).setValues(data);

  // Garante checkbox nas colunas D e E da linha recém inserida
  var linhaFinal = insertIndex + 2;
  sheet.getRange(linhaFinal, 4).insertCheckboxes();
  sheet.getRange(linhaFinal, 5).insertCheckboxes();

  return 'Jogo "' + nome + '" adicionado com sucesso!';
}

// ======================================================================
// ATUALIZAÇÃO DE TROFÉUS
// ======================================================================
var isFirstExec;

function updateTrophies() {
  Logger.log("Iniciando atualização dos troféus...");

  var properties = PropertiesService.getDocumentProperties();
  var steamApiKey = properties.getProperty('steamApiKey');
  var steamId = properties.getProperty('steamId');
  var xboxApiKey = properties.getProperty('xboxApiKey');
  var ui = SpreadsheetApp.getUi();

  if (!steamApiKey && !steamId && !xboxApiKey) {
    ui.alert('Será necessário configurar pelo menos uma chave API (Steam ou Xbox) para usar este recurso.');
    isFirstExec = true;
    editKeys(properties, ui, steamId, steamApiKey, xboxApiKey);
    return;
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var gamesCompleted = sheet.getRange("A3:A" + sheet.getLastRow()).getValues();
  var gamesPlatinando = sheet.getRange("G3:G" + sheet.getLastRow()).getValues();
  var completedResults = sheet.getRange("D3:D" + sheet.getLastRow()).getValues(); // Coluna D (Troféus)
  var platinandoResults = sheet.getRange("J3:J" + sheet.getLastRow()).getValues(); // Outra coluna de troféus

  var newCompletedResults = [];
  var newPlatinandoResults = [];

  var libraryGames = steamApiKey && steamId ? getLibraryGames(steamApiKey, steamId) : [];
  var xboxGames = xboxApiKey ? getXboxGames(xboxApiKey) : [];

  Logger.log("Jogos Steam encontrados: " + (libraryGames ? libraryGames.length : 0));
  Logger.log("Jogos Xbox encontrados: " + (xboxGames ? xboxGames.length : 0));
  if (xboxGames && xboxGames.length > 0) {
    Logger.log("Exemplo de estrutura de um título Xbox: " + JSON.stringify(xboxGames[0]));
  }

  if (!libraryGames && !xboxGames) {
    ui.alert('Erro ao obter os jogos. Verifique suas chaves API.');
    return;
  }

  for (var i = 0; i < gamesCompleted.length; i++) {
    var gameName = gamesCompleted[i][0] ? String(gamesCompleted[i][0]).trim() : '';
    var existingValue = completedResults[i][0] ? String(completedResults[i][0]).trim() : '';

    if (gameName.toLowerCase().includes("dropei")) {
      // Remover a palavra "dropei" do nome do jogo
      gameName = gameName.replace(/dropei/i, '').trim();

      if (existingValue) {
        newCompletedResults.push([existingValue]); // Se já tem troféu, mantém e segue
        continue;
      } else {
        newCompletedResults.push(['']); // Se não tem, deixa em branco
        continue;
      }
    }

    if (gameName) {
      var trophies = findTrophies(gameName, libraryGames, xboxGames, steamApiKey, steamId, xboxApiKey);
      newCompletedResults.push(trophies && trophies.total > 0
        ? [`${calculatePercentage(trophies.unlocked, trophies.total)}%`]
        : ['Não vinculado']);
    } else {
      newCompletedResults.push(['']);
    }
  }

  for (var j = 0; j < gamesPlatinando.length; j++) {
    var gameName = gamesPlatinando[j][0] ? String(gamesPlatinando[j][0]).trim() : '';
    var existingValue = platinandoResults[j][0] ? String(platinandoResults[j][0]).trim() : '';

    if (gameName.toLowerCase().includes("dropei")) {
      // Remover a palavra "dropei" do nome do jogo
      gameName = gameName.replace(/dropei/i, '').trim();

      if (existingValue) {
        newPlatinandoResults.push([existingValue]); // Se já tem troféu, mantém e segue
        continue;
      } else {
        var trophies = findTrophies(gameName, libraryGames, xboxGames, steamApiKey, steamId, xboxApiKey);
        newPlatinandoResults.push(trophies && trophies.total > 0
          ? [`${calculatePercentage(trophies.unlocked, trophies.total)}%`]
          : ['']);
      }
    }

    if (gameName) {
      var trophies = findTrophies(gameName, libraryGames, xboxGames, steamApiKey, steamId, xboxApiKey);
      newPlatinandoResults.push(trophies && trophies.total > 0
        ? [`${calculatePercentage(trophies.unlocked, trophies.total)}%`]
        : ['Não vinculado']);
    } else {
      newPlatinandoResults.push(['']);
    }
  }

  sheet.getRange(3, 4, newCompletedResults.length, 1).setValues(newCompletedResults);
  sheet.getRange(3, 10, newPlatinandoResults.length, 1).setValues(newPlatinandoResults);

  ui.alert('Troféus atualizados com sucesso!');
}

// --------------------- Menu de configuração das chaves -------------------------
function manageKeys() {

  var properties = PropertiesService.getDocumentProperties();
  var ui = SpreadsheetApp.getUi();

  var steamApiKey = properties.getProperty('steamApiKey') || 'Não configurada';
  var steamId = properties.getProperty('steamId') || 'Não configurado';
  var xboxApiKey = properties.getProperty('xboxApiKey') || 'Não configurada';

  if(steamApiKey != 'Não configurada' && steamId != 'Não configurado' && xboxApiKey == 'Não configurada'){
    var steamkey = '*'.repeat(steamApiKey.length - 4) + steamApiKey.slice(-4)
    var steamidkey = '*'.repeat(steamId.length - 4) + steamId.slice(-4)
    var xboxkey = xboxApiKey

  }else if(xboxApiKey != 'Não configurada' && steamApiKey == 'Não configurada' && steamId == 'Não configurado'){
    steamkey = steamApiKey
    steamidkey = steamId
    xboxkey = '*'.repeat(xboxApiKey.length - 4) + xboxApiKey.slice(-4)
  }else if(steamApiKey == 'Não configurada' && steamId == 'Não configurado' && xboxApiKey == 'Não configurada'){
    var changeSentence
    changeSentence = 'INSERIR suas'

    steamkey = steamApiKey
    steamidkey = steamId
    xboxkey = xboxApiKey
  }else{
    steamkey = '*'.repeat(steamApiKey.length - 4) + steamApiKey.slice(-4)
    steamidkey = '*'.repeat(steamId.length - 4) + steamId.slice(-4)
    xboxkey = '*'.repeat(xboxApiKey.length - 4) + xboxApiKey.slice(-4)
    changeSentence = 'EDITAR suas'

  }

  var menu = ui.alert(
    'Gerenciar Chaves de API',
    `Chaves atuais:\n\n` +
    `Steam API Key: ${steamkey}\n` +
    `Steam ID: ${steamidkey}\n` +
    `Xbox API Key: ${xboxkey}\n\n` +
    `Opções: \n\n` +
    `Escolha SIM para ${changeSentence} chaves\n Escolha NÃO para DELETAR chaves`,
    ui.ButtonSet.YES_NO_CANCEL
  );

  if (menu === ui.Button.YES) {
    editKeys(properties, ui, steamId, steamApiKey, xboxApiKey);
  } else if (menu === ui.Button.NO) {
    deleteKeys(properties, ui);
  }
}
function editKeys(properties, ui, steamId, steamApiKey, xboxApiKey) {
  while (true) {

    if (steamApiKey == 'Não configurada' && steamId == 'Não configurado' || xboxApiKey == 'Não configurada' || isFirstExec == true){
      var changeSentence
      var changeTextID
      var changeText

      changeSentence = 'Insira seu'
      changeTextID = ''
      changeText = ''
    }else{
      changeSentence = 'Editar'
      changeTextID = 'novo'
      changeText = 'nova'
    }


    var steamResponse = ui.prompt(
      changeSentence + ' Steam API Key:',
      'Digite sua ' + changeText + ' chave Steam (ou deixe vazio para não alterar):',
      ui.ButtonSet.OK_CANCEL
    );

    if (steamResponse.getSelectedButton() === ui.Button.OK) {
      var steamApiKey = steamResponse.getResponseText();

      if (steamApiKey) {
        properties.setProperty('steamApiKey', steamApiKey);

        var steamIdResponse = ui.prompt(
          changeSentence + ' Steam ID:',
          'Digite seu ' + changeTextID +  ' ID (Obrigatório para ver troféus Steam):',
          ui.ButtonSet.OK_CANCEL
        );

        if (
          steamIdResponse.getSelectedButton() === ui.Button.OK &&
          steamIdResponse.getResponseText()
        ) {
          properties.setProperty('steamId', steamIdResponse.getResponseText());
          break;
        } else {
          ui.alert(
            'Atenção',
            'Você deve fornecer um Steam ID para usar a Steam API Key.',
            ui.ButtonSet.OK
          );
          properties.deleteProperty('steamApiKey');
          continue;
        }
      }
    } else {
      break;
    }
  }

  var xboxResponse = ui.prompt(
    changeSentence + ' Xbox API Key:',
    'Digite sua ' + changeText + ' chave Xbox (ou deixe vazio para não alterar):',
    ui.ButtonSet.OK_CANCEL
  );

  if (
    xboxResponse.getSelectedButton() === ui.Button.OK &&
    xboxResponse.getResponseText()
  ) {
    properties.setProperty('xboxApiKey', xboxResponse.getResponseText());
  }
  if(steamResponse.getResponseText() != '' && steamIdResponse.getResponseText() != '' || xboxResponse.getResponseText() != '' ){
    ui.alert('As chaves foram atualizadas com sucesso!');
  }else{
    ui.alert('Nenhuma alteração foi feita.');
  }

}


function deleteKeys(properties, ui) {
  var confirmation = ui.alert('Confirmação', 'Tem certeza de que deseja DELETAR todas as chaves atuais?', ui.ButtonSet.YES_NO);
  if (confirmation === ui.Button.YES) {
    properties.deleteProperty('steamApiKey');
    properties.deleteProperty('steamId');
    properties.deleteProperty('xboxApiKey');
    ui.alert('As chaves foram deletadas com sucesso!');
  } else {
    ui.alert('Nenhuma alteração foi feita.');
  }
}

function calculatePercentage(current, total) {
  if (total === 0) return 0;
  return ((current / total) * 100).toFixed(2);
}
function getXboxGames(xboxApiKey) {
  var url = `https://xbl.io/api/v2/achievements`;
  var options = {
    method: "GET",
    headers: {
      "X-Authorization": xboxApiKey,
      "Accept": "application/json",
    },
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log("Xbox API retornou código HTTP " + code + ": " + response.getContentText());
      return null;
    }
    var jsonResponse = JSON.parse(response.getContentText());

    // Alguns proxies/versões da API embrulham a resposta assim:
    // { "content": { "titles": [...] }, "code": 200 }
    // Outras devolvem direto: { "titles": [...] }
    var payload = (jsonResponse && jsonResponse.content) ? jsonResponse.content : jsonResponse;

    // Se veio um "code" interno de erro (ex: 401) mesmo com HTTP 200, trata como falha
    if (jsonResponse && jsonResponse.code && jsonResponse.code !== 200 && !payload.titles) {
      Logger.log("Xbox API retornou código interno " + jsonResponse.code + " (chave inválida/expirada?)");
      return null;
    }

    if (payload && payload.titles) {
      return payload.titles;
    } else {
      Logger.log("Resposta da API Xbox sem 'titles': " + response.getContentText());
      return null;
    }
  } catch (e) {
    Logger.log("Erro ao acessar a API Xbox: " + e.toString());
    return null;
  }
}

// Busca as conquistas de um título Xbox específico (mais confiável que o
// campo "achievement" da lista geral, que vem zerado pra maioria dos jogos)
// Endpoint oficial: GET /v2/achievements/title/{titleId}
function getXboxTitleAchievements(titleId, xboxApiKey) {
  var url = `https://api.xbl.io/v2/achievements/title/${titleId}`;
  var options = {
    method: "GET",
    headers: {
      "X-Authorization": xboxApiKey,
      "Accept": "application/json",
    },
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log("Xbox achievements/title retornou HTTP " + code + " para titleId " + titleId + ": " + response.getContentText());
      return null;
    }
    var jsonResponse = JSON.parse(response.getContentText());
    var payload = (jsonResponse && jsonResponse.content) ? jsonResponse.content : jsonResponse;

    Logger.log("Resposta crua de achievements/title/" + titleId + ": " + response.getContentText().substring(0, 1500));

    // Formato real da resposta: content.achievements = [{ id, name, progressState, ... }]
    // progressState vem como "Achieved" quando desbloqueada (não "isUnlocked" como a doc sugeria)
    var lista = payload && payload.achievements;
    if (lista && Array.isArray(lista) && lista.length > 0) {
      var total = lista.length;
      var unlocked = lista.filter(function(a) { return a.progressState === "Achieved"; }).length;
      return { total: total, unlocked: unlocked };
    }
    return null;
  } catch (e) {
    Logger.log("Erro ao buscar conquistas do título " + titleId + ": " + e.toString());
    return null;
  }
}

// Extrai total/desbloqueados de um título Xbox, tolerando diferentes
// formatos que a API do xbl.io já usou (por nome de campo).
function getXboxTrophyData(title, xboxApiKey) {
  if (!title || !title.achievement) return null;
  var ach = title.achievement;

  var total = ach.totalAchievements;
  var current = ach.currentAchievements;

  // Fallback para versões antigas/alternativas da API que só trazem gamerscore
  if (total === undefined || total === null) {
    total = ach.totalGamerscore;
    current = ach.currentGamerscore;
  }

  total = Number(total) || 0;
  current = Number(current) || 0;

  // A lista geral de títulos costuma vir zerada mesmo quando você tem
  // conquistas de verdade. Nesse caso, busca os dados reais por título.
  if (total === 0 && xboxApiKey && title.titleId) {
    var detalhado = getXboxTitleAchievements(title.titleId, xboxApiKey);
    if (detalhado) {
      Logger.log(`Dados detalhados encontrados para titleId ${title.titleId}: ${JSON.stringify(detalhado)}`);
      return detalhado;
    } else {
      Logger.log(`Não foi possível obter dados detalhados para titleId ${title.titleId} (${title.name})`);
    }
  }

  if (total > 0) {
    return { total: total, unlocked: current };
  }
  return null;
}

function normalizeGameName(name) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/™|®/g, "")
    .replace(/[:\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function getSteamAppIdBySearch(gameName) {
  const query = encodeURIComponent(gameName);
  const url = `https://store.steampowered.com/api/storesearch/?term=${query}&l=english&cc=US`;

  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());

    if (json.items && json.items.length > 0) {
      return json.items[0].id; // melhor match
    }
  } catch (e) {
    Logger.log("Erro no Steam Store Search: " + e);
  }
  return null;
}

function findTrophies(gameName, libraryGames, xboxGames, steamApiKey, steamId, xboxApiKey) {

  const normalizedInput = normalizeGameName(gameName);

  // =======================
  // 1️⃣ STEAM - BIBLIOTECA (comprados) — calcula o melhor match, mas
  //     só usa DIRETO se for um match EXATO. Matches parciais ficam
  //     guardados como fallback, para não "roubar" jogos de Game Pass
  //     que têm nome parecido com algo da Steam.
  // =======================
  var steamMatch = null;
  var steamScore = 0;

  if (libraryGames && steamApiKey && steamId) {
    for (let game of libraryGames) {
      if (!game.name) continue;

      const normalizedLibName = normalizeGameName(game.name);

      let score = 0;
      if (normalizedLibName === normalizedInput) score = 100;
      else if (normalizedLibName.includes(normalizedInput)) score = 80;
      else if (normalizedInput.includes(normalizedLibName)) score = 70;

      if (score > steamScore) {
        steamScore = score;
        steamMatch = game;
      }
    }

    if (steamMatch && steamScore === 100) {
      Logger.log(`"${gameName}" -> match EXATO na Steam (${steamMatch.name})`);
      return getTrophies(steamMatch.appid, steamApiKey, steamId);
    }
  }

  // =======================
  // 2️⃣ XBOX
  // =======================
  if (xboxGames) {
    let xboxMatch = xboxGames.find(game =>
      normalizeGameName(game.name) === normalizedInput
    );

    if (!xboxMatch) {
      xboxMatch = xboxGames.find(game =>
        normalizeGameName(game.name).includes(normalizedInput)
      );
    }

    if (xboxMatch) {
      var xboxTrophies = getXboxTrophyData(xboxMatch, xboxApiKey);
      if (xboxTrophies) {
        Logger.log(`"${gameName}" -> match no Xbox (${xboxMatch.name})`);
        return xboxTrophies;
      }
      Logger.log(`"${gameName}" -> achou título Xbox "${xboxMatch.name}" mas sem dados de conquista utilizáveis.`);
    }
  }

  // =======================
  // 3️⃣ STEAM (match parcial, como fallback só agora)
  // =======================
  if (steamMatch) {
    Logger.log(`"${gameName}" -> usando match parcial da Steam (${steamMatch.name}) como fallback`);
    return getTrophies(steamMatch.appid, steamApiKey, steamId);
  }

  // =======================
  // 4️⃣ STEAM STORE SEARCH (Family Share SOMENTE AGORA)
  // =======================
  if (steamApiKey && steamId) {
    const appId = getSteamAppIdBySearch(gameName);
    if (appId) {
      return getTrophies(appId, steamApiKey, steamId);
    }
  }

  Logger.log(`"${gameName}" -> nenhum vínculo encontrado.`);
  return null;
}



function getLibraryGames(steamApiKey, steamId) {
  var url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${steamId}&include_appinfo=1&format=json`;
  try {
    var response = UrlFetchApp.fetch(url, { 'muteHttpExceptions': true });
    var jsonResponse = JSON.parse(response.getContentText());
    if (jsonResponse.response && jsonResponse.response.games) {
      return jsonResponse.response.games;
    } else {
      return null;
    }
  } catch (error) {
    Logger.log('Erro ao obter jogos da biblioteca:', error);
    return null;
  }
}

function getTrophies(appId, steamApiKey, steamId) {
  var url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${steamApiKey}&steamid=${steamId}&appid=${appId}`;
  try {
    var response = UrlFetchApp.fetch(url, { 'muteHttpExceptions': true });
    var jsonResponse = JSON.parse(response.getContentText());
    if (jsonResponse && jsonResponse.playerstats && jsonResponse.playerstats.achievements) {
      var achievements = jsonResponse.playerstats.achievements;
      var totalTrophies = achievements.length;
      var unlockedTrophies = achievements.filter(trophy => trophy.achieved).length;
      return { total: totalTrophies, unlocked: unlockedTrophies };
    } else {
      return null;
    }
  } catch (e) {
    Logger.log('Erro ao obter troféus do jogo:', e);
    return null;
  }
}


// ======================================================================
// API WEB APP (FRONTEND INTEGRATION V2 - SINCRONIZAÇÃO TOTAL)
// ======================================================================

function gerarTokenAPI() {
  var props = PropertiesService.getDocumentProperties();
  var token = props.getProperty('api_token');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('api_token', token);
  }
  var connectionUrl = getConnectionUrl_(token);
  SpreadsheetApp.getUi().alert(
    'URL de conexão do site',
    connectionUrl
      ? 'Cole esta URL no site. Ela já contém o token:\n\n' + connectionUrl
      : 'A URL ativa não foi definida. Use Backlog → Definir URL ativa do app e informe a implantação terminada em /exec.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function configurarUrlWebApp() {
  var webAppUrl = promptAndSaveWebAppUrl_();
  if (!webAppUrl) return;

  SpreadsheetApp.getUi().alert(
    'URL ativa salva',
    'Esta implantação será usada nas próximas URLs de conexão:\n\n' + webAppUrl,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function regenerarTokenAPI() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    'Regenerar token da API',
    'O token atual deixará de funcionar imediatamente. Deseja continuar?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  var token = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getDocumentProperties().setProperty('api_token', token);
  var connectionUrl = getConnectionUrl_(token);
  ui.alert(
    'Novo token gerado',
    connectionUrl
      ? 'A URL anterior deixou de funcionar. Cole esta nova URL no site:\n\n' + connectionUrl
      : 'O token foi atualizado, mas a URL ativa não foi definida. Use Backlog → Definir URL ativa do app.',
    ui.ButtonSet.OK
  );
}

function getConnectionUrl_(token) {
  var webAppUrl = getSavedWebAppUrl_();
  if (!webAppUrl) webAppUrl = promptAndSaveWebAppUrl_();
  return webAppUrl ? webAppUrl + '?token=' + encodeURIComponent(token) : '';
}

function getSavedWebAppUrl_() {
  var properties = PropertiesService.getDocumentProperties();
  var savedUrl = normalizePublishedWebAppUrl_(properties.getProperty('webAppUrl'));
  if (!savedUrl) properties.deleteProperty('webAppUrl');
  return savedUrl;
}

function promptAndSaveWebAppUrl_() {
  var ui = SpreadsheetApp.getUi();
  var currentUrl = getSavedWebAppUrl_();
  var message = 'Cole a URL da implantação que funciona e termina em /exec. Ela ficará salva nesta planilha.';
  if (currentUrl) message += '\n\nURL atual: ' + currentUrl;

  var response = ui.prompt('URL ativa do app da Web', message, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return '';

  var webAppUrl = normalizePublishedWebAppUrl_(response.getResponseText());
  if (!webAppUrl) {
    ui.alert(
      'URL inválida',
      'Use a URL publicada pelo Apps Script no formato https://script.google.com/macros/s/.../exec.',
      ui.ButtonSet.OK
    );
    return '';
  }

  PropertiesService.getDocumentProperties().setProperty('webAppUrl', webAppUrl);
  return webAppUrl;
}

function normalizePublishedWebAppUrl_(value) {
  var cleanUrl = String(value || '').trim().split(/[?#]/)[0].replace(/\/+$/, '');
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(cleanUrl) ? cleanUrl : '';
}

// Retorna todos os dados mapeados exatamente como estão na planilha
function doGetLegacy_(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = { backlog: [], concluidos: [], platinando: [], dropados: [] };

  // 1. Backlog (A Jogar)
  var mainSheet = ss.getSheets()[0]; 
  var lastRowMain = mainSheet.getLastRow();
  if (lastRowMain > 1) {
    var mainValues = mainSheet.getRange(2, 1, lastRowMain - 1, 4).getValues();
    data.backlog = mainValues.filter(r => r[0]).map((r, i) => ({ nome: r[0], plataforma: r[1], interesse: r[2], trofeus: r[3], row: i + 2 }));
  }

  // 2. Concluídos (Esquerda) e Platinando (Direita)
  var concluidosSheet = ss.getSheetByName("Jogos Concluídos");
  if (concluidosSheet) {
    var lastRowC = concluidosSheet.getLastRow();
    if (lastRowC > 2) {
      // Esquerda (A:D)
      var cValues = concluidosSheet.getRange(3, 1, lastRowC - 2, 5).getValues();
      data.concluidos = cValues.filter(r => r[0]).map((r, i) => ({ nome: r[0], plataforma: r[1], data: r[2], trofeus: r[3], isPlatinado: r[4] === 'Platinado', row: i + 3 }));
      
      // Direita (G:J)
      var pValues = concluidosSheet.getRange(3, 7, lastRowC - 2, 4).getValues();
      data.platinando = pValues.filter(r => r[0]).map((r, i) => ({ nome: r[0], plataforma: r[1], data: r[2], trofeus: r[3], row: i + 3 }));
    }
  }

  // 3. Dropados
  var dropadosSheet = ss.getSheetByName("Dropados");
  if (dropadosSheet) {
    var lastRowD = dropadosSheet.getLastRow();
    if (lastRowD > 1) {
      var dValues = dropadosSheet.getRange(2, 1, lastRowD - 1, 3).getValues();
      data.dropados = dValues.filter(r => r[0]).map((r, i) => ({ nome: r[0], plataforma: r[1], data: r[2], row: i + 2 }));
    }
  }

  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// Recebe ações do site e aciona o MESMO código da planilha (Mock onEdit)
function doPostLegacy_(e) {
  var result = { success: false, message: "" };
  try {
    var payload = JSON.parse(e.postData.contents);
    var props = PropertiesService.getDocumentProperties();
    if (payload.token !== props.getProperty('api_token')) throw new Error("Token inválido!");
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Adicionar Jogo Novo
    if (payload.action === 'ADD_GAME') {
      adicionarJogoBacklog({ nome: payload.nome, plataforma: payload.plataforma, nivel: payload.interesse });
      result.success = true;
    } 
    
    // Atualizar Troféus (Headless - sem alertas na tela)
    else if (payload.action === 'FETCH_TROPHIES') {
      atualizarTrofeusHeadless();
      result.success = true;
    }
    // Adicione isso no meio dos seus outros "if / else if" da função doPost:
else if (payload.action === 'GET_COVER') {
      var sgKey = payload.steamgridKey;
      var igdbId = payload.igdbClientId;
      var igdbSecret = payload.igdbClientSecret;
      var rawgKey = payload.rawgKey;
      var gameName = payload.gameName;
      result.coverUrl = null;

      // TENTATIVA 1: SteamGridDB (Formato Capa Vertical)
      if (sgKey && gameName) {
        var searchUrl = "https://www.steamgriddb.com/api/v2/search/autocomplete/" + encodeURIComponent(gameName);
        var options = { headers: { "Authorization": "Bearer " + sgKey }, muteHttpExceptions: true };

        try {
          var searchRes = JSON.parse(UrlFetchApp.fetch(searchUrl, options).getContentText());
          if (searchRes.data && searchRes.data.length > 0) {
            var imgUrl = "https://www.steamgriddb.com/api/v2/grids/game/" + searchRes.data[0].id + "?dimensions=600x900";
            var imgRes = JSON.parse(UrlFetchApp.fetch(imgUrl, options).getContentText());
            if (imgRes.data && imgRes.data.length > 0) {
              result.coverUrl = imgRes.data[0].url;
              result.success = true;
            }
          }
        } catch(e) { Logger.log("SteamGrid falhou para: " + gameName); }
      }

      // TENTATIVA 2: IGDB (cobre jogos ainda não lançados)
      if (!result.coverUrl && igdbId && igdbSecret && gameName) {
        var igdbCover = getIGDBCover(gameName, igdbId, igdbSecret);
        if (igdbCover) {
          result.coverUrl = igdbCover;
          result.success = true;
        }
      }

      // TENTATIVA 3: RAWG (fallback final)
      if (!result.coverUrl && rawgKey && gameName) {
        try {
          var rawgUrl = "https://api.rawg.io/api/games?search=" + encodeURIComponent(gameName) + "&key=" + rawgKey;
          var rawgRes = JSON.parse(UrlFetchApp.fetch(rawgUrl, { muteHttpExceptions: true }).getContentText());

          if (rawgRes.results && rawgRes.results.length > 0 && rawgRes.results[0].background_image) {
            result.coverUrl = rawgRes.results[0].background_image;
            result.success = true;
          }
        } catch(e) { Logger.log("RAWG falhou para: " + gameName); }
      }
    }
    // Mover ou Editar (Simulando o onEdit nativo da sua planilha!)
else if (payload.action === 'EDIT_OR_MOVE') {
      var sheetName = payload.sheetName; // "Lista de Jogos", "Jogos Concluídos" ou "Dropados"
      var sheet = ss.getSheetByName(sheetName) || ss.getSheets()[0];
      ss.setActiveSheet(sheet); // Força a planilha a saber qual aba está ativa

      var mock_e = {
        range: sheet.getRange(payload.row, payload.col),
        value: payload.value,
        source: ss
      };

      // Nome (col 1) e Plataforma (col 2) não têm lógica especial no onEdit,
      // então gravamos o valor direto na célula.
      if (payload.col === 1 || payload.col === 2) {
        mock_e.range.setValue(payload.value);
        result.success = true;
      } else {
        // Nível de Interesse: grava o valor antes de rodar o onEdit
        // (exceto "dropei", que é tratado internamente sem persistir o texto)
        if (payload.col === 3 && sheetName !== "Dropados" && payload.value !== 'dropei') {
          mock_e.range.setValue(payload.value);
        }
        onEdit(mock_e); // Chama sua função principal — dispara mover/ordenar quando necessário
        result.success = true;
      }
    }
  } catch(err) {
    result.message = err.toString();
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}


// Recria a lógica de troféus sem a interface gráfica (para a API)
function atualizarTrofeusHeadless() {
  var properties = PropertiesService.getDocumentProperties();
  var steamApiKey = properties.getProperty('steamApiKey');
  var steamId = properties.getProperty('steamId');
  var xboxApiKey = properties.getProperty('xboxApiKey');
  if (!steamApiKey && !steamId && !xboxApiKey) throw new Error("Chaves de API não configuradas na planilha.");

  var libraryGames = steamApiKey && steamId ? getLibraryGames(steamApiKey, steamId) : [];
  var xboxGames = xboxApiKey ? getXboxGames(xboxApiKey) : [];
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // CORREÇÃO: Forçar explicitamente a aba correta, ignorando a aba ativa
  var sheet = ss.getSheetByName("Jogos Concluídos");
  if (!sheet) return; // Se a aba não existir, cancela para não quebrar nada
  
  var rowsToUpdate = [
    { startCol: 1, writeCol: 4 }, // Concluidos A:D
    { startCol: 7, writeCol: 10 } // Platinando G:J
  ];

  rowsToUpdate.forEach(param => {
    // Pega a partir da linha 3 (pulando cabeçalhos)
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) return;

    var games = sheet.getRange(3, param.startCol, lastRow - 2, 1).getValues();
    var results = sheet.getRange(3, param.writeCol, lastRow - 2, 1).getValues();
    var newResults = [];
    
    for (var i = 0; i < games.length; i++) {
      var gameName = games[i][0] ? String(games[i][0]).replace(/dropei/i, '').trim() : '';
      if (gameName && !results[i][0]) {
        var trophies = findTrophies(gameName, libraryGames, xboxGames, steamApiKey, steamId, xboxApiKey);
        newResults.push(trophies && trophies.total > 0 ? [`${calculatePercentage(trophies.unlocked, trophies.total)}%`] : ['']);
      } else {
        newResults.push([results[i][0] || '']);
      }
    }
    if (newResults.length > 0) {
      sheet.getRange(3, param.writeCol, newResults.length, 1).setValues(newResults);
    }
  });
}
// ======================================================================
// IGDB (via Twitch OAuth) — cobre jogos ainda não lançados, que o
// SteamGridDB e o RAWG normalmente não têm.
// ======================================================================
function getIGDBToken(clientId, clientSecret) {
  var cache = CacheService.getDocumentCache();
  var cached = cache.get('igdb_token');
  if (cached) return cached;

  var url = "https://id.twitch.tv/oauth2/token?client_id=" + encodeURIComponent(clientId) +
             "&client_secret=" + encodeURIComponent(clientSecret) +
             "&grant_type=client_credentials";
  var res = UrlFetchApp.fetch(url, { method: "post", muteHttpExceptions: true });
  var json = JSON.parse(res.getContentText());
  if (!json.access_token) return null;

  // Token do Twitch dura ~60 dias; guardamos por 1h no cache pra evitar
  // gerar um novo a cada requisição (o cache do Apps Script expira em no
  // máximo 6h por chamada, então 1h é um valor seguro e conservador).
  cache.put('igdb_token', json.access_token, 3600);
  return json.access_token;
}

function getIGDBCover(gameName, clientId, clientSecret) {
  try {
    var token = getIGDBToken(clientId, clientSecret);
    if (!token) return null;

    var url = "https://api.igdb.com/v4/games";
    var options = {
      method: "post",
      headers: {
        "Client-ID": clientId,
        "Authorization": "Bearer " + token
      },
      // "cover.url" já traz o campo de imagem direto, sem 2ª chamada.
      // Busca inclui jogos não lançados (não filtramos por release date).
      payload: 'search "' + gameName.replace(/"/g, '\\"') + '"; fields name,cover.url,first_release_date; limit 5;',
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(url, options);
    var results = JSON.parse(res.getContentText());
    if (!results || results.length === 0) return null;

    // Prioriza um resultado que já tenha capa
    var match = results.find(function(g) { return g.cover && g.cover.url; }) || results[0];
    if (!match.cover || !match.cover.url) return null;

    // IGDB retorna algo como "//images.igdb.com/igdb/image/upload/t_thumb/xxx.jpg"
    // trocamos para t_cover_big (capa vertical, boa resolução) e garantimos https.
    var imgUrl = match.cover.url.replace("t_thumb", "t_cover_big");
    if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
    return imgUrl;
  } catch (e) {
    Logger.log("IGDB falhou para: " + gameName + " -> " + e.toString());
    return null;
  }
}
