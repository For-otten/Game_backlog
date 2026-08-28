import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('index.html', 'utf8');
const apiSource = readFileSync('google-apps-script/Api.gs', 'utf8');
const appSource = readFileSync('js/app.js', 'utf8');
const uiSource = readFileSync('js/ui.js', 'utf8');

for (const id of ['status-filters', 'games-list', 'game-form', 'settings-form', 'confirm-dialog', 'toast']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Elemento #${id} ausente no HTML.`);
}
assert.match(html, /id="profile-provider"/, 'Identificação da plataforma do perfil ausente.');
assert.doesNotMatch(html, /\sonclick=/i, 'A interface não deve voltar a usar handlers inline.');
assert.match(html, /type="module" src="\.\/js\/app\.js"/, 'Entrada JavaScript modular ausente.');
assert.match(html, /option value="date"/, 'A opção de ordenação por data está ausente.');
assert.match(appSource, /concluidos:\s*'progress'/, 'Concluídos devem usar progresso como ordenação padrão.');
assert.match(appSource, /backlog:\s*'sheet'/, 'Backlog deve manter a ordem da planilha por padrão.');
assert.match(appSource, /dropados:\s*'date'/, 'Dropados devem usar data como ordenação padrão.');
assert.match(uiSource, /sort === 'date'/, 'A ordenação por data não foi implementada.');

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
}

class FakeSheet {
  constructor(name, cells) {
    this.name = name;
    this.cells = cells;
  }
  getName() { return this.name; }
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
  UrlFetchApp: { fetch: (url) => ({
    getResponseCode: () => 200,
    getContentText: () => {
      if (url.includes('GetPlayerSummaries')) return JSON.stringify({ response: { players: [{ personaname: 'Herion', avatarfull: 'https://cdn.example/avatar.jpg', profileurl: 'https://steamcommunity.com/id/herion/' }] } });
      if (url.includes('GetSteamLevel')) return JSON.stringify({ response: { player_level: 42 } });
      return JSON.stringify({ response: { game_count: 2, games: [{ playtime_forever: 120 }, { playtime_forever: 180 }] } });
    }
  }) },
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
assert.equal(context.getIntegrationStatus_().steamgrid, true);
const steamProfile = context.getConnectedSteamProfile_();
assert.equal(steamProfile.profileName, 'Herion');
assert.equal(steamProfile.steamLevel, 42);
assert.equal(steamProfile.steamOwnedGames, 2);
assert.equal(steamProfile.steamHours, 5);

console.log('Estrutura e regras principais verificadas com sucesso.');
