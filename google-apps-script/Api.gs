/**
 * API estável do Game Backlog.
 *
 * Este arquivo substitui o fluxo antigo que simulava onEdit pelo site. As
 * operações abaixo alteram diretamente a tabela correta, sob lock, e sempre
 * conferem o nome esperado antes de editar uma linha.
 */

var GAME_DB = {
  mainSheet: 'Lista de Jogos',
  completedSheet: 'Jogos Concluídos',
  droppedSheet: 'Dropados',
  backlogStart: 2,
  completedStart: 3,
  droppedStart: 2,
  sourceColumn: 26
};

var STEAM_WISHLIST_SOURCE_HEADER = '_checkpoint_source';
var STEAM_WISHLIST_SOURCE_PREFIX = 'steam_wishlist:';

function doGet(e) {
  try {
    requireApiToken_((e && e.parameter && e.parameter.token) || '');
    return jsonOutput_({ success: true, data: readGameDatabase_() });
  } catch (error) {
    return jsonOutput_({ success: false, message: error.message || String(error) });
  }
}

function doPost(e) {
  var lock = LockService.getDocumentLock();
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    requireApiToken_(payload.token || '');

    if (payload.action === 'GET_COVER') {
      return jsonOutput_(findCover_(payload));
    }

    lock.waitLock(15000);
    var result;

    switch (payload.action) {
      case 'GET_LIBRARY':
        result = {
          message: 'Biblioteca carregada.',
          profile: getConnectedSteamProfile_(),
          configuration: getIntegrationStatus_()
        };
        break;
      case 'SAVE_SETTINGS':
        result = saveIntegrationSettings_(payload);
        break;
      case 'ADD_GAME':
        result = addBacklogGame_(payload);
        break;
      case 'UPDATE_GAME':
        result = updateGame_(payload);
        break;
      case 'MOVE_GAME':
        result = moveGame_(payload);
        break;
      case 'FETCH_TROPHIES':
        atualizarTrofeusHeadless();
        result = { message: 'Troféus sincronizados.' };
        break;
      case 'IMPORT_STEAM_WISHLIST':
        result = importSteamWishlist_();
        break;
      default:
        throw new Error('Ação não reconhecida.');
    }

    return jsonOutput_({
      success: true,
      message: result && result.message ? result.message : 'Alteração salva.',
      data: readGameDatabase_(),
      profile: result && result.profile ? result.profile : null,
      configuration: result && result.configuration ? result.configuration : null,
      imported: result && typeof result.imported === 'number' ? result.imported : null,
      skipped: result && typeof result.skipped === 'number' ? result.skipped : null,
      removed: result && typeof result.removed === 'number' ? result.removed : null
    });
  } catch (error) {
    return jsonOutput_({ success: false, message: error.message || String(error) });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/** Mantém as ações feitas diretamente nas caixas de seleção da planilha. */
function onEdit(e) {
  if (!e || !e.range || !e.source) return;

  var lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  var row = e.range.getRow();
  var column = e.range.getColumn();
  var checked = e.value === true || String(e.value).toUpperCase() === 'TRUE';
  var value = e.value == null ? '' : String(e.value).trim().toLowerCase();

  if (sheetName === getMainSheet_().getName() && row >= GAME_DB.backlogStart) {
    if (column === 3 && value === 'dropei') {
      moveGame_({ from: 'backlog', to: 'dropados', row: row });
    } else if (column === 4 && checked) {
      moveGame_({ from: 'backlog', to: 'concluidos', row: row });
    }
    return;
  }

  if (sheetName === GAME_DB.completedSheet && row >= GAME_DB.completedStart) {
    if (column === 5 && checked) {
      moveGame_({ from: 'concluidos', to: 'platinando', row: row });
    } else if (column === 11 && checked) {
      moveGame_({ from: 'platinando', to: 'platinados', row: row });
    }
    return;
  }

  if (sheetName === GAME_DB.droppedSheet && row >= GAME_DB.droppedStart && column === 4 && checked) {
    moveGame_({ from: 'dropados', to: 'backlog', row: row });
  }
  } finally {
    lock.releaseLock();
  }
}

function readGameDatabase_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = {
    backlog: [],
    concluidos: [],
    platinando: [],
    platinados: [],
    dropados: []
  };

  var main = getMainSheet_();
  var mainLast = lastNamedRow_(main, GAME_DB.backlogStart, 1);
  if (mainLast >= GAME_DB.backlogStart) {
    var backlogValues = main.getRange(GAME_DB.backlogStart, 1, mainLast - GAME_DB.backlogStart + 1, 3).getValues();
    backlogValues.forEach(function (record, index) {
      if (!record[0]) return;
      data.backlog.push({
        nome: String(record[0]),
        plataforma: String(record[1] || ''),
        interesse: normalizeInterest_(record[2]),
        trofeus: '',
        row: GAME_DB.backlogStart + index
      });
    });
  }

  var completed = ss.getSheetByName(GAME_DB.completedSheet);
  if (completed) {
    var completedLast = Math.max(
      lastNamedRow_(completed, GAME_DB.completedStart, 1),
      lastNamedRow_(completed, GAME_DB.completedStart, 7)
    );

    if (completedLast >= GAME_DB.completedStart) {
      var count = completedLast - GAME_DB.completedStart + 1;
      var leftValues = completed.getRange(GAME_DB.completedStart, 1, count, 5).getValues();
      var rightValues = completed.getRange(GAME_DB.completedStart, 7, count, 5).getValues();

      leftValues.forEach(function (record, index) {
        if (!record[0]) return;
        var game = {
          nome: String(record[0]),
          plataforma: String(record[1] || ''),
          data: record[2] || '',
          trofeus: normalizeTrophy_(record[3]),
          isPlatinado: isPlatinumRecord_(record[3], record[4]),
          row: GAME_DB.completedStart + index
        };
        data[game.isPlatinado ? 'platinados' : 'concluidos'].push(game);
      });

      rightValues.forEach(function (record, index) {
        if (!record[0]) return;
        data.platinando.push({
          nome: String(record[0]),
          plataforma: String(record[1] || ''),
          data: record[2] || '',
          trofeus: normalizeTrophy_(record[3]),
          row: GAME_DB.completedStart + index
        });
      });
    }
  }

  var dropped = ss.getSheetByName(GAME_DB.droppedSheet);
  if (dropped) {
    var droppedLast = lastNamedRow_(dropped, GAME_DB.droppedStart, 1);
    if (droppedLast >= GAME_DB.droppedStart) {
      var droppedValues = dropped.getRange(GAME_DB.droppedStart, 1, droppedLast - GAME_DB.droppedStart + 1, 3).getValues();
      droppedValues.forEach(function (record, index) {
        if (!record[0]) return;
        data.dropados.push({
          nome: String(record[0]),
          plataforma: String(record[1] || ''),
          data: record[2] || '',
          row: GAME_DB.droppedStart + index
        });
      });
    }
  }

  return data;
}

function addBacklogGame_(payload) {
  var name = cleanRequired_(payload.nome, 'O nome do jogo é obrigatório.');
  var platform = cleanRequired_(payload.plataforma, 'A plataforma é obrigatória.');
  var interest = normalizeInterest_(payload.interesse || payload.nivel || 'Médio');
  var sheet = getMainSheet_();

  assertNotDuplicate_(sheet, name, platform);

  var lastRow = lastNamedRow_(sheet, GAME_DB.backlogStart, 1);
  var targetRow = GAME_DB.backlogStart;
  var newOrder = interestOrder_(interest);

  if (lastRow >= GAME_DB.backlogStart) {
    var values = sheet.getRange(GAME_DB.backlogStart, 1, lastRow - GAME_DB.backlogStart + 1, 3).getValues();
    targetRow = lastRow + 1;
    for (var i = 0; i < values.length; i++) {
      if (values[i][0] && interestOrder_(values[i][2]) >= newOrder) {
        targetRow = GAME_DB.backlogStart + i;
        break;
      }
    }
    if (targetRow <= lastRow) sheet.insertRowBefore(targetRow);
  }

  ensureRowExists_(sheet, targetRow);
  sheet.getRange(targetRow, 1, 1, 3).setValues([[name, platform, interest]]);
  sheet.getRange(targetRow, 4).insertCheckboxes().setValue(false);
  sheet.getRange(targetRow, 5).clearContent().clearDataValidations();
  writeBacklogSourceTag_(sheet, targetRow, payload.sourceTag || '');

  return { message: '“' + name + '” foi adicionado ao backlog.' };
}

function importSteamWishlist_() {
  var steamId = String(PropertiesService.getDocumentProperties().getProperty('steamId') || '').trim();
  if (!steamId) throw new Error('Configure o Steam ID nas propriedades da planilha antes de importar a wishlist.');

  var wishlistGames = fetchSteamWishlistGames_(steamId);
  var wishlistAppIds = {};
  wishlistGames.forEach(function (game) { wishlistAppIds[String(game.appid)] = true; });

  var sheet = getMainSheet_();
  var sourceSync = syncWishlistSourceRows_(sheet, wishlistAppIds);

  var database = readGameDatabase_();
  var existingNames = {};
  ['backlog', 'concluidos', 'platinando', 'platinados', 'dropados'].forEach(function (collection) {
    database[collection].forEach(function (game) {
      existingNames[normalizeKey_(game.nome)] = true;
    });
  });

  var added = 0;
  var skipped = 0;
  var unresolved = 0;
  wishlistGames.slice().reverse().forEach(function (game) {
    var nameKey = normalizeKey_(game.name);
    if (!nameKey) {
      unresolved += 1;
      return;
    }
    if (existingNames[nameKey] || sourceSync.activeAppIds[String(game.appid)]) {
      skipped += 1;
      return;
    }

    addBacklogGame_({
      nome: game.name,
      plataforma: 'Steam',
      interesse: 'Médio',
      sourceTag: STEAM_WISHLIST_SOURCE_PREFIX + game.appid
    });
    existingNames[nameKey] = true;
    sourceSync.activeAppIds[String(game.appid)] = true;
    added += 1;
  });

  var changes = [];
  if (added) changes.push(added + (added === 1 ? ' jogo adicionado ao backlog' : ' jogos adicionados ao backlog'));
  if (sourceSync.removed) changes.push(sourceSync.removed + (sourceSync.removed === 1 ? ' jogo removido do backlog' : ' jogos removidos do backlog'));

  var message = changes.length ? 'Wishlist Steam: ' + changes.join(' e ') + '.' : 'Wishlist Steam verificada: nenhuma alteração.';
  if (skipped) message += ' ' + skipped + (skipped === 1 ? ' jogo já estava na biblioteca.' : ' jogos já estavam na biblioteca.');
  if (unresolved) message += ' ' + unresolved + (unresolved === 1 ? ' item não pôde ser identificado.' : ' itens não puderam ser identificados.');
  return {
    message: message,
    imported: added,
    skipped: skipped,
    removed: sourceSync.removed
  };
}

function fetchSteamWishlistGames_(steamId) {
  var countUrl = 'https://api.steampowered.com/IWishlistService/GetWishlistItemCount/v1/?steamid=' + encodeURIComponent(steamId);
  var countData = fetchSteamJson_(countUrl);
  var count = countData && countData.response && countData.response.count;
  if (typeof count !== 'number') {
    throw new Error('A wishlist não está pública no perfil Steam.');
  }
  if (count === 0) return [];

  var wishlistUrl = 'https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=' + encodeURIComponent(steamId);
  var wishlistData = fetchSteamJson_(wishlistUrl);
  var wishlistItems = wishlistData && wishlistData.response && wishlistData.response.items;
  if (!Array.isArray(wishlistItems) || !wishlistItems.length) {
    throw new Error('A Steam não retornou os itens da wishlist. Tente novamente mais tarde.');
  }

  var itemsByAppId = {};
  var batchSize = 100;
  for (var offset = 0; offset < wishlistItems.length; offset += batchSize) {
    var batch = wishlistItems.slice(offset, offset + batchSize).filter(function (item) {
      return Number(item && item.appid) > 0;
    });
    if (!batch.length) continue;

    var request = {
      ids: batch.map(function (item) { return { appid: Number(item.appid) }; }),
      context: { language: 'brazilian', country_code: 'BR', steam_realm: 1 },
      data_request: { include_basic_info: true }
    };
    var itemsUrl = 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/';
    var storeData = fetchSteamJson_(itemsUrl, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: { input_json: JSON.stringify(request) }
    });
    var storeItems = storeData && storeData.response && storeData.response.store_items;
    (storeItems || []).forEach(function (item) {
      var appId = Number(item && item.appid);
      var name = String((item && item.name) || '').trim();
      if (appId && name) itemsByAppId[appId] = name;
    });
  }

  return wishlistItems.map(function (item) {
    var appId = Number(item && item.appid);
    return { appid: appId, name: itemsByAppId[appId] || '' };
  }).filter(function (item) { return item.appid; });
}

function syncWishlistSourceRows_(sheet, currentAppIds) {
  ensureWishlistSourceColumn_(sheet);
  var lastRow = lastNamedRow_(sheet, GAME_DB.backlogStart, 1);
  var activeAppIds = {};
  var rowsToDelete = [];

  if (lastRow >= GAME_DB.backlogStart) {
    var sourceValues = sheet.getRange(
      GAME_DB.backlogStart,
      GAME_DB.sourceColumn,
      lastRow - GAME_DB.backlogStart + 1,
      1
    ).getValues();

    sourceValues.forEach(function (record, index) {
      var tag = String(record[0] || '').trim();
      if (tag.indexOf(STEAM_WISHLIST_SOURCE_PREFIX) !== 0) return;
      var appId = tag.slice(STEAM_WISHLIST_SOURCE_PREFIX.length);
      if (currentAppIds[appId]) {
        activeAppIds[appId] = true;
      } else {
        rowsToDelete.push(GAME_DB.backlogStart + index);
      }
    });
  }

  rowsToDelete.sort(function (a, b) { return b - a; }).forEach(function (row) {
    sheet.deleteRow(row);
  });

  return { activeAppIds: activeAppIds, removed: rowsToDelete.length };
}

function writeBacklogSourceTag_(sheet, row, sourceTag) {
  var tag = String(sourceTag || '').trim();
  if (!tag) {
    if (sheet.getMaxColumns() >= GAME_DB.sourceColumn) {
      sheet.getRange(row, GAME_DB.sourceColumn).clearContent();
    }
    return;
  }

  ensureWishlistSourceColumn_(sheet);
  sheet.getRange(row, GAME_DB.sourceColumn).setValue(tag);
}

function ensureWishlistSourceColumn_(sheet) {
  if (sheet.getMaxColumns() < GAME_DB.sourceColumn) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), GAME_DB.sourceColumn - sheet.getMaxColumns());
  }

  var header = String(sheet.getRange(1, GAME_DB.sourceColumn).getValue() || '').trim();
  if (header && header !== STEAM_WISHLIST_SOURCE_HEADER) {
    throw new Error('A coluna técnica Z já está em uso. Libere essa coluna para sincronizar a wishlist.');
  }
  if (!header) sheet.getRange(1, GAME_DB.sourceColumn).setValue(STEAM_WISHLIST_SOURCE_HEADER);
  sheet.hideColumns(GAME_DB.sourceColumn);
}

function updateGame_(payload) {
  var collection = String(payload.collection || '');
  var row = positiveRow_(payload.row);
  var record = readRecord_(collection, row);
  assertExpectedGame_(record, payload.expectedName);

  var name = cleanRequired_(payload.nome, 'O nome do jogo é obrigatório.');
  var platform = cleanRequired_(payload.plataforma, 'A plataforma é obrigatória.');
  var sheet = record.sheet;

  sheet.getRange(row, record.startColumn).setValue(name);
  sheet.getRange(row, record.startColumn + 1).setValue(platform);

  if (collection === 'backlog') {
    sheet.getRange(row, 3).setValue(normalizeInterest_(payload.interesse || record.interesse));
  }

  return { message: 'Alterações de “' + name + '” salvas.' };
}

function moveGame_(payload) {
  var from = String(payload.from || '');
  var to = String(payload.to || '');
  var row = positiveRow_(payload.row);
  var record = readRecord_(from, row);
  assertExpectedGame_(record, payload.expectedName);

  if (from === 'backlog' && to === 'concluidos') {
    writeCompleted_(record, false);
  } else if (from === 'backlog' && to === 'dropados') {
    writeDropped_(record);
  } else if (from === 'concluidos' && to === 'platinando') {
    writePlatinando_(record);
  } else if (from === 'platinando' && to === 'platinados') {
    writeCompleted_(record, true);
  } else if (from === 'dropados' && to === 'backlog') {
    addBacklogGame_({ nome: record.nome, plataforma: record.plataforma, interesse: 'Médio' });
  } else {
    throw new Error('Movimentação inválida.');
  }

  clearSourceRecord_(record);
  return { message: '“' + record.nome + '” foi movido com sucesso.' };
}

function readRecord_(collection, row) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet;
  var startColumn;
  var values;

  if (collection === 'backlog') {
    sheet = getMainSheet_();
    startColumn = 1;
    values = sheet.getRange(row, 1, 1, 3).getValues()[0];
    return { collection: collection, sheet: sheet, row: row, startColumn: 1, width: 5, nome: values[0], plataforma: values[1], interesse: values[2], trofeus: '' };
  }
  if (collection === 'concluidos' || collection === 'platinados') {
    sheet = requiredSheet_(GAME_DB.completedSheet);
    startColumn = 1;
    values = sheet.getRange(row, 1, 1, 5).getValues()[0];
    return { collection: collection, sheet: sheet, row: row, startColumn: 1, width: 5, nome: values[0], plataforma: values[1], data: values[2], trofeus: values[3] };
  }
  if (collection === 'platinando') {
    sheet = requiredSheet_(GAME_DB.completedSheet);
    startColumn = 7;
    values = sheet.getRange(row, 7, 1, 5).getValues()[0];
    return { collection: collection, sheet: sheet, row: row, startColumn: 7, width: 5, nome: values[0], plataforma: values[1], data: values[2], trofeus: values[3] };
  }
  if (collection === 'dropados') {
    sheet = requiredSheet_(GAME_DB.droppedSheet);
    startColumn = 1;
    values = sheet.getRange(row, 1, 1, 4).getValues()[0];
    return { collection: collection, sheet: sheet, row: row, startColumn: 1, width: 4, nome: values[0], plataforma: values[1], data: values[2] };
  }
  throw new Error('Lista inválida.');
}

function writeCompleted_(record, platinum) {
  var sheet = getOrCreateCompletedSheet_();
  var row = firstEmptyRow_(sheet, GAME_DB.completedStart, 1);
  sheet.getRange(row, 1, 1, 4).setValues([[
    record.nome,
    record.plataforma,
    formattedNow_(),
    record.trofeus || ''
  ]]);
  var marker = sheet.getRange(row, 5);
  marker.clearDataValidations();
  if (platinum) {
    marker.setValue('Platinado');
  } else {
    marker.insertCheckboxes().setValue(false);
  }
}

function writePlatinando_(record) {
  var sheet = getOrCreateCompletedSheet_();
  var row = firstEmptyRow_(sheet, GAME_DB.completedStart, 7);
  sheet.getRange(row, 7, 1, 4).setValues([[
    record.nome,
    record.plataforma,
    formattedNow_(),
    record.trofeus || ''
  ]]);
  sheet.getRange(row, 11).insertCheckboxes().setValue(false);
}

function writeDropped_(record) {
  var sheet = getOrCreateDroppedSheet_();
  sheet.insertRowBefore(GAME_DB.droppedStart);
  sheet.getRange(GAME_DB.droppedStart, 1, 1, 3).setValues([[
    record.nome,
    record.plataforma,
    formattedNow_()
  ]]);
  sheet.getRange(GAME_DB.droppedStart, 4).insertCheckboxes().setValue(false);
}

function clearSourceRecord_(record) {
  if (record.collection === 'backlog' || record.collection === 'dropados') {
    record.sheet.deleteRow(record.row);
    return;
  }
  record.sheet.getRange(record.row, record.startColumn, 1, record.width).clearContent().clearDataValidations();
}

function getPlataformasExistentes() {
  var data = readGameDatabase_();
  var unique = {};
  ['backlog', 'concluidos', 'platinando', 'platinados', 'dropados'].forEach(function (collection) {
    data[collection].forEach(function (game) {
      var platform = String(game.plataforma || '').trim();
      if (platform) unique[platform] = true;
    });
  });
  return Object.keys(unique).sort();
}

function adicionarJogoBacklog(dados) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
    return addBacklogGame_(dados).message;
  } finally {
    lock.releaseLock();
  }
}

function getMainSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var named = ss.getSheetByName(GAME_DB.mainSheet);
  if (named) return named;

  var special = [GAME_DB.completedSheet, GAME_DB.droppedSheet];
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (special.indexOf(sheets[i].getName()) === -1) return sheets[i];
  }
  throw new Error('A aba principal da lista de jogos não foi encontrada.');
}

function getOrCreateCompletedSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GAME_DB.completedSheet);
  if (!sheet) {
    sheet = ss.insertSheet(GAME_DB.completedSheet);
    sheet.getRange(2, 1, 1, 11).setValues([[
      'Nome do Jogo', 'Plataforma', 'Data de Conclusão', 'Troféus', 'Platinar?', '',
      'Nome do Jogo (Platinando)', 'Plataforma', 'Data', 'Troféus', 'Platinado?'
    ]]).setFontWeight('bold');
  }
  return sheet;
}

function getOrCreateDroppedSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GAME_DB.droppedSheet);
  if (!sheet) {
    sheet = ss.insertSheet(GAME_DB.droppedSheet);
    sheet.getRange(1, 1, 1, 4).setValues([['Nome do Jogo', 'Plataforma', 'Data de Drop', 'Voltar?']]).setFontWeight('bold');
  }
  return sheet;
}

function requiredSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('A aba “' + name + '” não foi encontrada.');
  return sheet;
}

function firstEmptyRow_(sheet, startRow, nameColumn) {
  var lastRow = Math.max(sheet.getLastRow(), startRow);
  var values = sheet.getRange(startRow, nameColumn, lastRow - startRow + 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (!values[i][0]) return startRow + i;
  }
  var target = lastRow + 1;
  ensureRowExists_(sheet, target);
  return target;
}

function lastNamedRow_(sheet, startRow, column) {
  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) return startRow - 1;
  var values = sheet.getRange(startRow, column, lastRow - startRow + 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] !== '' && values[i][0] !== null) return startRow + i;
  }
  return startRow - 1;
}

function ensureRowExists_(sheet, row) {
  if (sheet.getMaxRows() < row) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
}

function assertNotDuplicate_(sheet, name, platform) {
  var last = lastNamedRow_(sheet, GAME_DB.backlogStart, 1);
  if (last < GAME_DB.backlogStart) return;
  var values = sheet.getRange(GAME_DB.backlogStart, 1, last - GAME_DB.backlogStart + 1, 2).getValues();
  var wantedName = normalizeKey_(name);
  var wantedPlatform = normalizeKey_(platform);
  var duplicate = values.some(function (row) {
    return normalizeKey_(row[0]) === wantedName && normalizeKey_(row[1]) === wantedPlatform;
  });
  if (duplicate) throw new Error('Esse jogo já existe no backlog para a mesma plataforma.');
}

function assertExpectedGame_(record, expectedName) {
  if (!record.nome) throw new Error('O jogo não existe mais nessa linha. Atualize a página e tente novamente.');
  if (expectedName && normalizeKey_(record.nome) !== normalizeKey_(expectedName)) {
    throw new Error('A lista mudou desde a última atualização. Sincronize e tente novamente.');
  }
}

function requireApiToken_(provided) {
  var expected = PropertiesService.getDocumentProperties().getProperty('api_token');
  if (!expected) throw new Error('Gere o token da API pelo menu Backlog na planilha.');
  if (!provided || provided !== expected) throw new Error('Token inválido.');
}

function cleanRequired_(value, message) {
  var clean = value == null ? '' : String(value).trim();
  if (!clean) throw new Error(message);
  return clean;
}

function normalizeInterest_(value) {
  var clean = normalizeKey_(value);
  if (clean === 'alto') return 'Alto';
  if (clean === 'baixo') return 'Baixo';
  return 'Médio';
}

function interestOrder_(value) {
  var interest = normalizeInterest_(value);
  return interest === 'Alto' ? 0 : interest === 'Médio' ? 1 : 2;
}

function normalizeKey_(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function normalizeTrophy_(value) {
  if (value === '' || value === null || value === undefined) return '';
  var clean = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(clean)) clean += '%';
  return clean;
}

function isPlatinumRecord_(trophies, marker) {
  if (normalizeKey_(marker) === 'platinado') return true;
  var percent = parseFloat(String(trophies || '').replace(',', '.'));
  return !isNaN(percent) && percent >= 100;
}

function positiveRow_(value) {
  var row = Number(value);
  if (!Number.isInteger(row) || row < 2) throw new Error('Linha inválida.');
  return row;
}

function formattedNow_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm:ss');
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function findCover_(payload) {
  var result = { success: false, coverUrl: null, message: '' };
  var gameName = String(payload.gameName || '').trim();
  if (!gameName) return result;
  var properties = PropertiesService.getDocumentProperties();
  var steamgridKey = properties.getProperty('steamgridApiKey') || payload.steamgridKey || '';
  var rawgKey = properties.getProperty('rawgApiKey') || payload.rawgKey || '';
  var igdbClientId = properties.getProperty('igdbClientId') || payload.igdbClientId || '';
  var igdbClientSecret = properties.getProperty('igdbClientSecret') || payload.igdbClientSecret || '';

  if (steamgridKey) {
    try {
      var options = { headers: { Authorization: 'Bearer ' + steamgridKey }, muteHttpExceptions: true };
      var searchUrl = 'https://www.steamgriddb.com/api/v2/search/autocomplete/' + encodeURIComponent(gameName);
      var search = JSON.parse(UrlFetchApp.fetch(searchUrl, options).getContentText());
      if (search.data && search.data.length) {
        var gridUrl = 'https://www.steamgriddb.com/api/v2/grids/game/' + search.data[0].id + '?dimensions=600x900';
        var grids = JSON.parse(UrlFetchApp.fetch(gridUrl, options).getContentText());
        if (grids.data && grids.data.length) result.coverUrl = grids.data[0].url;
      }
    } catch (ignoreSteamGrid) {}
  }

  if (!result.coverUrl && igdbClientId && igdbClientSecret) {
    result.coverUrl = getIGDBCover(gameName, igdbClientId, igdbClientSecret);
  }

  if (!result.coverUrl && rawgKey) {
    try {
      var rawgUrl = 'https://api.rawg.io/api/games?search=' + encodeURIComponent(gameName) + '&key=' + rawgKey;
      var rawg = JSON.parse(UrlFetchApp.fetch(rawgUrl, { muteHttpExceptions: true }).getContentText());
      if (rawg.results && rawg.results.length) result.coverUrl = rawg.results[0].background_image || null;
    } catch (ignoreRawg) {}
  }

  result.success = Boolean(result.coverUrl);
  if (!result.success) result.message = 'Capa não encontrada.';
  return result;
}

function saveIntegrationSettings_(payload) {
  var properties = PropertiesService.getDocumentProperties();
  var secretFields = {
    steamgridKey: 'steamgridApiKey',
    rawgKey: 'rawgApiKey',
    igdbClientId: 'igdbClientId',
    igdbClientSecret: 'igdbClientSecret'
  };

  Object.keys(secretFields).forEach(function (payloadKey) {
    var value = String(payload[payloadKey] || '').trim();
    if (value) properties.setProperty(secretFields[payloadKey], value);
  });

  var profileName = String(payload.profileName || '').trim();
  var profileSubtitle = String(payload.profileSubtitle || '').trim();
  if (profileName) properties.setProperty('siteProfileName', profileName);
  if (profileSubtitle) properties.setProperty('siteProfileSubtitle', profileSubtitle);

  return {
    message: 'Perfil e integrações salvos na planilha.',
    profile: getConnectedSteamProfile_(),
    configuration: getIntegrationStatus_()
  };
}

function getIntegrationStatus_() {
  var properties = PropertiesService.getDocumentProperties();
  return {
    steam: Boolean(properties.getProperty('steamApiKey') && properties.getProperty('steamId')),
    steamWishlist: Boolean(properties.getProperty('steamId')),
    xbox: Boolean(properties.getProperty('xboxApiKey')),
    steamgrid: Boolean(properties.getProperty('steamgridApiKey')),
    rawg: Boolean(properties.getProperty('rawgApiKey')),
    igdb: Boolean(properties.getProperty('igdbClientId') && properties.getProperty('igdbClientSecret')),
    igdbId: Boolean(properties.getProperty('igdbClientId')),
    igdbSecret: Boolean(properties.getProperty('igdbClientSecret'))
  };
}

function getConnectedSteamProfile_() {
  var properties = PropertiesService.getDocumentProperties();
  var steamApiKey = properties.getProperty('steamApiKey');
  var steamId = properties.getProperty('steamId');
  var fallback = {
    profileName: properties.getProperty('siteProfileName') || 'Jogador',
    profileSubtitle: properties.getProperty('siteProfileSubtitle') || 'Perfil local'
  };
  if (!steamApiKey || !steamId) return fallback;

  var cache = CacheService.getDocumentCache();
  var cached = cache.get('checkpoint-steam-profile-v1');
  if (cached) {
    try { return JSON.parse(cached); } catch (ignoreCache) {}
  }

  try {
    var summaryUrl = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=' + encodeURIComponent(steamApiKey) + '&steamids=' + encodeURIComponent(steamId);
    var summary = fetchSteamJson_(summaryUrl);
    var players = summary && summary.response && summary.response.players;
    if (!players || !players.length) return fallback;
    var player = players[0];

    var steamLevel = null;
    var ownedGames = null;
    var totalHours = null;
    try {
      var levelUrl = 'https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=' + encodeURIComponent(steamApiKey) + '&steamid=' + encodeURIComponent(steamId);
      var levelData = fetchSteamJson_(levelUrl);
      steamLevel = levelData && levelData.response ? Number(levelData.response.player_level) : null;
    } catch (ignoreLevel) {}

    try {
      var gamesUrl = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=' + encodeURIComponent(steamApiKey) + '&steamid=' + encodeURIComponent(steamId) + '&include_appinfo=0&include_played_free_games=1&format=json';
      var gamesData = fetchSteamJson_(gamesUrl);
      var gameResponse = gamesData && gamesData.response;
      if (gameResponse) {
        ownedGames = Number(gameResponse.game_count || 0);
        var minutes = (gameResponse.games || []).reduce(function (sum, game) {
          return sum + Number(game.playtime_forever || 0);
        }, 0);
        totalHours = Math.round(minutes / 60);
      }
    } catch (ignoreGames) {}

    var profile = {
      source: 'steam',
      profileName: player.personaname || fallback.profileName,
      profileSubtitle: player.realname || 'Perfil público Steam',
      avatar: player.avatarfull || player.avatarmedium || player.avatar || '',
      profileUrl: player.profileurl || '',
      steamLevel: isNaN(steamLevel) ? null : steamLevel,
      steamOwnedGames: ownedGames,
      steamHours: totalHours
    };
    cache.put('checkpoint-steam-profile-v1', JSON.stringify(profile), 600);
    return profile;
  } catch (error) {
    console.warn('Não foi possível sincronizar o perfil Steam: ' + error.message);
    return fallback;
  }
}

function fetchSteamJson_(url, options) {
  var requestOptions = options || {};
  requestOptions.muteHttpExceptions = true;
  var response = UrlFetchApp.fetch(url, requestOptions);
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Steam respondeu com HTTP ' + status + '.');
  return JSON.parse(response.getContentText());
}
