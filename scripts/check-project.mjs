import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('index.html', 'utf8');
const apiSource = readFileSync('google-apps-script/Api.gs', 'utf8');

for (const id of ['status-filters', 'games-list', 'game-form', 'settings-form', 'confirm-dialog', 'toast']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Elemento #${id} ausente no HTML.`);
}
assert.doesNotMatch(html, /\sonclick=/i, 'A interface não deve voltar a usar handlers inline.');
assert.match(html, /type="module" src="\.\/js\/app\.js"/, 'Entrada JavaScript modular ausente.');

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
const { LibraryCache, SettingsStore, isWebAppUrl } = await import('../js/api.js?project-check');
const migratedSettings = new SettingsStore().get();
assert.equal(migratedSettings.url, 'https://script.google.com/macros/s/deployment-id/exec');
assert.equal(migratedSettings.token, 'legacy-token');
assert.equal(migratedSettings.steamgrid, 'legacy-cover-key');
assert.ok(stored.has('checkpoint.settings.v2'), 'As configurações antigas devem ser migradas automaticamente.');
assert.equal(new LibraryCache().read().backlog[0].nome, 'Migrado');
assert.equal(isWebAppUrl('https://docs.google.com/spreadsheets/d/test/edit'), false);
assert.equal(isWebAppUrl('https://script.google.com/macros/s/id/exec'), true);
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
const context = vm.createContext({
  SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
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

console.log('Estrutura e regras principais verificadas com sucesso.');
