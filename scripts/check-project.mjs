import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('index.html', 'utf8');
const apiSource = readFileSync('google-apps-script/Api.gs', 'utf8');
const appSource = readFileSync('js/app.js', 'utf8');
const uiSource = readFileSync('js/ui.js', 'utf8');
const manifest = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
const serviceWorker = readFileSync('service-worker.js', 'utf8');
const checkpointIcon = readFileSync('public/icons/checkpoint.svg', 'utf8');

for (const id of ['status-filters', 'games-list', 'game-form', 'settings-form', 'confirm-dialog', 'toast']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Elemento #${id} ausente no HTML.`);
}
assert.match(html, /id="profile-provider"/, 'Identificação da plataforma do perfil ausente.');
assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/, 'Manifesto PWA ausente no HTML.');
assert.match(html, /class="brand-mark"/, 'Marca vetorial ausente no cabeçalho.');
assert.match(html, /id="wishlist-import-button"/, 'A ação de importar a wishlist Steam está ausente.');
assert.doesNotMatch(html, /\sonclick=/i, 'A interface não deve voltar a usar handlers inline.');
assert.match(html, /type="module" src="\.\/js\/app\.js"/, 'Entrada JavaScript modular ausente.');
assert.match(html, /option value="date"/, 'A opção de ordenação por data está ausente.');
assert.match(appSource, /concluidos:\s*'progress'/, 'Concluídos devem usar progresso como ordenação padrão.');
assert.match(appSource, /backlog:\s*'sheet'/, 'Backlog deve manter a ordem da planilha por padrão.');
assert.match(appSource, /dropados:\s*'date'/, 'Dropados devem usar data como ordenação padrão.');
assert.match(uiSource, /sort === 'date'/, 'A ordenação por data não foi implementada.');
assert.match(appSource, /importSteamWishlist/, 'A interface não aciona a importação da wishlist Steam.');
assert.match(appSource, /checkWishlist:\s*true/, 'A wishlist Steam deve ser verificada ao abrir o site.');
assert.match(appSource, /wishlistImport\?\.imported\s*>\s*0\s*\|\|\s*wishlistImport\?\.removed\s*>\s*0/, 'Alterações automáticas da wishlist devem ser informadas ao usuário.');
assert.match(apiSource, /IMPORT_STEAM_WISHLIST/, 'A API não reconhece a importação da wishlist Steam.');
assert.match(apiSource, /STEAM_WISHLIST_SOURCE_PREFIX/, 'Jogos importados precisam de uma origem técnica interna.');
assert.match(apiSource, /syncWishlistSourceRows_/, 'Jogos removidos da wishlist precisam ser reconciliados no backend.');
assert.doesNotMatch(html, /steam_wishlist:/, 'A origem técnica da wishlist não deve aparecer no frontend.');
assert.equal(manifest.start_url, './');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
assert.match(serviceWorker, /self\.addEventListener\('fetch'/, 'O service worker precisa atender requisições offline.');
assert.match(appSource, /serviceWorker\.register\('\.\/service-worker\.js'\)/, 'O service worker não é registrado pela aplicação.');
assert.doesNotMatch(appSource, /beforeinstallprompt/, 'A interface deve preservar o prompt nativo de instalação do navegador.');
assert.doesNotMatch(checkpointIcon, />\s*CP\s*</i, 'A marca não deve usar o monograma CP.');

const stored = new Map([
  ['gs_url', 'https://script.google.com/macros/s/deployment-id/exec'],
  ['gs_token', 'legacy-token'],
  ['steamgrid_key', 'legacy-cover-key'],
  ['gs_cached_data', JSON.stringify({ backlog: [{ nome: 'Migrado', row: 2 }] })]
]);
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value))
};
const { LibraryCache, SettingsStore, isWebAppUrl, parseConnectionUrl } = await import('../js/api.js?project-check');
const migratedSettings = new SettingsStore().get();
assert.equal(migratedSettings.url, 'https://script.google.com/macros/s/deployment-id/exec');
assert.equal(migratedSettings.token, 'legacy-token');
assert.equal(migratedSettings.steamgrid, 'legacy-cover-key');
assert.ok(stored.has('checkpoint.settings.v2'), 'As configurações antigas devem ser migradas automaticamente.');
assert.equal(new LibraryCache().read().backlog[0].nome, 'Migrado');
assert.equal(isWebAppUrl('https://docs.google.com/spreadsheets/d/test/edit'), false);
assert.equal(isWebAppUrl('https://script.google.com/macros/s/id/exec'), true);
assert.equal(isWebAppUrl('https://script.google.com/macros/s/id/exec#token=secret'), true);
assert.deepEqual(
  parseConnectionUrl('https://script.google.com/macros/s/id/exec#token=secret'),
  { url: 'https://script.google.com/macros/s/id/exec', token: 'secret' }
);
assert.deepEqual(
  parseConnectionUrl('https://script.google.com/macros/s/current-id/exec?token=secret'),
  { url: 'https://script.google.com/macros/s/current-id/exec', token: 'secret' }
);
delete globalThis.localStorage;

class FakeRange {
  constructor(sheet, row, column, rows, columns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }

  getValues() {
    return Array.from({ length: this.rows }, (_, rowOffset) =>
      Array.from({ length: this.columns }, (_, columnOffset) =>
        this.sheet.cells[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? ''
      )
    );
  }

  getValue() { return this.getValues()[0][0]; }

  setValue(value) {
    if (!this.sheet.cells[this.row - 1]) this.sheet.cells[this.row - 1] = [];
    this.sheet.cells[this.row - 1][this.column - 1] = value;
    return this;
  }

  clearContent() {
    for (let rowOffset = 0; rowOffset < this.rows; rowOffset += 1) {
      if (!this.sheet.cells[this.row - 1 + rowOffset]) continue;
      for (let columnOffset = 0; columnOffset < this.columns; columnOffset += 1) {
        this.sheet.cells[this.row - 1 + rowOffset][this.column - 1 + columnOffset] = '';
      }
    }
    return this;
  }
}

class FakeSheet {
  constructor(name, cells) {
    this.name = name;
    this.cells = cells;
  }
  getName() { return this.name; }
  getMaxColumns() { return Math.max(1, ...this.cells.map((row) => row?.length || 0)); }
  insertColumnsAfter(column, count) {
    this.cells.forEach((row) => row.splice(column, 0, ...Array(count).fill('')));
  }
  hideColumns(column) { this.hiddenColumn = column; }
  deleteRow(row) { this.cells.splice(row - 1, 1); }
  getLastRow() {
    for (let index = this.cells.length - 1; index >= 0; index -= 1) {
      if (this.cells[index]?.some((cell) => cell !== '' && cell != null)) return index + 1;
    }
    return 0;
  }
  getRange(row, column, rows = 1, columns = 1) { return new FakeRange(this, row, column, rows, columns); }
}

const sheets = [
  new FakeSheet('Lista de Jogos', [
    ['Nome', 'Plataforma', 'Interesse'],
    ['Hades', 'PC', 'Alto'],
    ['', '', ''],
    ['Cocoon', 'Xbox', 'Médio']
  ]),
  new FakeSheet('Jogos Concluídos', [
    [],
    ['Nome', 'Plataforma', 'Data', 'Troféus', 'Platinar?', '', 'Nome', 'Plataforma', 'Data', 'Troféus'],
    ['Inside', 'PC', '01/01/2026', '50%', false],
    [],
    ['Celeste', 'PC', '02/01/2026', '100%', 'Platinado', '', 'Hollow Knight', 'PC', '03/01/2026', '83%']
  ]),
  new FakeSheet('Dropados', [
    ['Nome', 'Plataforma', 'Data'],
    ['Limbo', 'PC', '04/01/2026']
  ])
];

const spreadsheet = {
  getSheetByName: (name) => sheets.find((sheet) => sheet.getName() === name) || null,
  getSheets: () => sheets
};
const documentProperties = new Map([
  ['steamApiKey', 'steam-secret'],
  ['steamId', '76561198000000000'],
  ['steamgridApiKey', 'cover-secret']
]);
const documentCache = new Map();
const urlFetchCalls = [];
const context = vm.createContext({
  SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
  PropertiesService: { getDocumentProperties: () => ({
    getProperty: (key) => documentProperties.get(key) || null,
    setProperty: (key, value) => documentProperties.set(key, String(value))
  }) },
  CacheService: { getDocumentCache: () => ({
    get: (key) => documentCache.get(key) || null,
    put: (key, value) => documentCache.set(key, value)
  }) },
  UrlFetchApp: { fetch: (url, options = {}) => {
    urlFetchCalls.push({ url, options });
    return ({
    getResponseCode: () => 200,
    getContentText: () => {
      if (url.includes('GetPlayerSummaries')) return JSON.stringify({ response: { players: [{ personaname: 'Herion', avatarfull: 'https://cdn.example/avatar.jpg', profileurl: 'https://steamcommunity.com/id/herion/' }] } });
      if (url.includes('GetSteamLevel')) return JSON.stringify({ response: { player_level: 42 } });
      if (url.includes('GetWishlistItemCount')) return JSON.stringify({ response: { count: 2 } });
      if (url.includes('GetWishlist/v1')) return JSON.stringify({ response: { items: [{ appid: 220860 }, { appid: 233860 }] } });
      if (url.includes('IStoreBrowseService')) return JSON.stringify({ response: { store_items: [{ appid: 220860, name: 'McPixel' }, { appid: 233860, name: 'Kenshi' }] } });
      return JSON.stringify({ response: { game_count: 2, games: [{ playtime_forever: 120 }, { playtime_forever: 180 }] } });
    }
    });
  } },
  console
});
vm.runInContext(apiSource, context);

const data = context.readGameDatabase_();
assert.deepEqual(Array.from(data.backlog, (game) => game.row), [2, 4], 'As linhas físicas do backlog devem ser preservadas.');
assert.equal(data.concluidos[0].row, 3);
assert.equal(data.platinados[0].nome, 'Celeste');
assert.equal(data.platinados[0].row, 5);
assert.equal(data.platinando[0].row, 5, 'A tabela da direita deve manter seu próprio índice de linha.');
assert.equal(data.dropados[0].row, 2);
assert.equal(context.isPlatinumRecord_('', 'Platinado'), true);
assert.equal(context.isPlatinumRecord_('100%', ''), true);
assert.equal(context.isPlatinumRecord_('99%', ''), false);
assert.equal(context.normalizeInterest_('medio'), 'Médio');
assert.equal(context.getIntegrationStatus_().steam, true);
assert.equal(context.getIntegrationStatus_().steamWishlist, true);
assert.equal(context.getIntegrationStatus_().steamgrid, true);
const steamProfile = context.getConnectedSteamProfile_();
assert.equal(steamProfile.profileName, 'Herion');
assert.equal(steamProfile.steamLevel, 42);
assert.equal(steamProfile.steamOwnedGames, 2);
assert.equal(steamProfile.steamHours, 5);
assert.deepEqual(
  Array.from(context.fetchSteamWishlistGames_('76561198000000000'), (game) => game.name),
  ['McPixel', 'Kenshi'],
  'A wishlist deve resolver os AppIDs em nomes de jogos.'
);
const storeBrowseCall = urlFetchCalls.find((call) => call.url.includes('IStoreBrowseService'));
assert.notEqual(storeBrowseCall.options.method, 'post', 'O endpoint público da loja Steam rejeita POST com HTTP 405.');
assert.match(storeBrowseCall.url, /input_json=/);
assert.ok(storeBrowseCall.url.length <= 1900, 'Cada consulta da wishlist deve permanecer abaixo do limite de URL do Apps Script.');
const largeWishlist = Array.from({ length: 300 }, (_, index) => ({ appid: 100000 + index }));
const wishlistBatches = Array.from(context.splitSteamWishlistBatches_(largeWishlist), (batch) => Array.from(batch));
assert.ok(wishlistBatches.length > 1, 'Wishlists grandes devem ser divididas em várias consultas.');
wishlistBatches.forEach((batch) => assert.ok(context.buildSteamStoreItemsUrl_(batch).length <= 1900));

const sourceHeader = Array(26).fill('');
sourceHeader[0] = 'Nome';
sourceHeader[25] = '_checkpoint_source';
const importedCurrent = Array(26).fill('');
importedCurrent[0] = 'McPixel';
importedCurrent[25] = 'steam_wishlist:220860';
const importedRemoved = Array(26).fill('');
importedRemoved[0] = 'Jogo removido da wishlist';
importedRemoved[25] = 'steam_wishlist:999';
const manualSteam = Array(26).fill('');
manualSteam[0] = 'Jogo Steam manual';
const sourceSheet = new FakeSheet('Lista de Jogos', [sourceHeader, importedCurrent, importedRemoved, manualSteam]);
const sourceResult = context.syncWishlistSourceRows_(sourceSheet, { 220860: true });
assert.equal(sourceResult.removed, 1, 'Somente a origem ausente da wishlist deve ser removida.');
assert.deepEqual(sourceSheet.cells.slice(1).map((row) => row[0]), ['McPixel', 'Jogo Steam manual']);
assert.equal(sourceSheet.hiddenColumn, 26, 'A coluna técnica da origem deve permanecer oculta.');

console.log('Estrutura e regras principais verificadas com sucesso.');
