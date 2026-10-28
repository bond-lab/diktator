// Unit tests for the pure helpers in app/app.js. Run: node pipeline/test_app.js
const assert = require('node:assert/strict');
const path = require('node:path');
const app = require(path.join(__dirname, '..', 'app', 'app.js'));

assert.deepEqual(app.spellingUnits('chléb'), ['ch', 'l', 'é', 'b']);
assert.deepEqual(app.spellingUnits('Pochod'), ['p', 'o', 'ch', 'o', 'd']);
assert.deepEqual(app.spellingUnits('dům'), ['d', 'ů', 'm']);
for (const u of app.spellingUnits('příšerně hřích žluťoučký kůň')) assert.ok(app.LETTER_NAMES[u], `no name for ${u}`);
assert.equal(app.letterName('b'), 'bé');
assert.equal(app.letterName('y', (a) => a[0]), 'tvrdé y');
assert.equal(app.letterName('y', (a) => a[1]), 'ypsilon');
assert.equal(app.letterName('o', (a) => a[1]), 'krátké o');
assert.equal(app.letterName('ó'), 'dlouhé ó');
assert.ok(['měkké i', 'krátké měkké i'].includes(app.letterName('i')));
assert.equal(app.letterName('ch'), 'chá');
assert.equal(app.letterName('9'), '9');

assert.equal(app.band(0), 5); assert.equal(app.band(1), 1); assert.equal(app.band(2000), 1);
assert.equal(app.band(2001), 2); assert.equal(app.band(15000), 3); assert.equal(app.band(15001), 4);

const s = { caseSensitive: false, punctSensitive: false };
assert.equal(app.normalize('  Dům. ', 'word', s), 'dům');
assert.equal(app.normalize('Tom je v knihovně.', 'sentence', s), app.normalize('tom je v knihovně', 'sentence', s));
assert.notEqual(app.normalize('Tom je v knihovně.', 'sentence', { ...s, punctSensitive: true }), app.normalize('tom je v knihovně', 'sentence', { ...s, punctSensitive: true }));
assert.equal(app.normalize('15. 3. 2024', 'number', s), '15.3.2024');
assert.equal(app.normalize('2 345', 'number', s), '2345');
assert.equal(app.normalize('Dům', 'word', { ...s, caseSensitive: true }), 'Dům');
assert.equal(app.normalize('dům', 'word', s), 'dům'); // NFC

const d = app.charDiff('dům', 'dum');
assert.deepEqual(d.map((x) => x.op + x.ch), ['eqd', 'delů', 'insu', 'eqm']);
assert.deepEqual(app.charDiff('abc', 'abc').map((x) => x.op), ['eq', 'eq', 'eq']);
assert.deepEqual(app.charDiff('', 'ab').map((x) => x.op), ['ins', 'ins']);

assert.equal(app.dayOrdinal(1), 'prvního');
assert.equal(app.dayOrdinal(21), 'dvacátého prvního');
assert.equal(app.dayOrdinal(30), 'třicátého');
assert.equal(app.dayOrdinal(31), 'třicátého prvního');

assert.deepEqual(app.numberUnits(0), ['nula']);
assert.deepEqual(app.numberUnits(21), ['dvacet', 'jedna']);
assert.deepEqual(app.numberUnits(200), ['dvě', 'stě']);
assert.deepEqual(app.numberUnits(345), ['tři', 'sta', 'čtyřicet', 'pět']);
assert.deepEqual(app.numberUnits(1000), ['tisíc']);
assert.deepEqual(app.numberUnits(1001), ['tisíc', 'jedna']);
assert.deepEqual(app.numberUnits(2000), ['dva', 'tisíce']);
assert.deepEqual(app.numberUnits(22000), ['dvacet', 'dva', 'tisíce']);
assert.deepEqual(app.numberUnits(21000), ['dvacet', 'jedna', 'tisíc']);
assert.deepEqual(app.numberUnits(1989), ['tisíc', 'devět', 'set', 'osmdesát', 'devět']);
assert.deepEqual(app.numberUnits(5000000), ['pět', 'milionů']);
assert.deepEqual(app.numberUnits(10000000), ['deset', 'milionů']);
assert.equal(app.plural(1, 'hodina', 'hodiny', 'hodin'), 'hodina');
assert.equal(app.plural(3, 'hodina', 'hodiny', 'hodin'), 'hodiny');
assert.equal(app.plural(12, 'hodina', 'hodiny', 'hodin'), 'hodin');
assert.equal(app.plural(23, 'hodina', 'hodiny', 'hodin'), 'hodiny');
for (let n = 0; n <= 10000000; n = n * 7 + 1) {
  for (const u of app.numberUnits(n)) assert.ok(app.NUMBER_UNITS.includes(u), `${u} not in NUMBER_UNITS`);
}
assert.deepEqual(app.groupUnits('012'), ['nula', 'dvanáct']);
assert.deepEqual(app.groupUnits('001'), ['nula', 'nula', 'jedna']);
assert.deepEqual(app.groupUnits('000'), ['nula', 'nula', 'nula']);
assert.deepEqual(app.groupUnits('456'), ['čtyři', 'sta', 'padesát', 'šest']);
{
  const it = app.makeNumberItem(['phone'], { randInt: () => 12345678, choice: (a) => a[0] });
  assert.equal(it.text, '612 345 678');
  assert.equal(it.say, 'šest set dvanáct, tři sta čtyřicet pět, šest set sedmdesát osm');
  const pc = app.makeNumberItem(['postcode'], { randInt: () => 12000, choice: (a) => a[0] });
  assert.equal(pc.text, '120 00');
  assert.deepEqual(pc.units, ['sto', 'dvacet', ',', 'nula', 'nula']);
  assert.equal(app.normalize(' 120 00 ', 'number', s), app.normalize('12000', 'number', s));
}
const twoRng = { randInt: () => 2, choice: (a) => a[0] };
assert.deepEqual(app.makeNumberItem(['time'], twoRng).units, ['dvě', 'hodiny', 'dvě', 'minuty']);

const rng = { randInt: (lo) => lo, choice: (a) => a[0] };
assert.deepEqual(app.makeNumberItem(['date'], rng), { kind: 'number', text: '1.1.1900', units: ['prvního', 'ledna', 'tisíc', 'devět', 'set'], say: 'prvního ledna tisíc devět set', hint: 'date as d. m. yyyy' });
assert.deepEqual(app.makeNumberItem(['time'], rng).say, 'nula hodin');
assert.equal(app.makeNumberItem(['year'], rng).say, 'rok tisíc pět set');
for (let i = 0; i < 200; i += 1) {
  const it = app.makeNumberItem(['small', 'medium', 'large', 'year', 'date', 'time', 'phone', 'postcode']);
  assert.equal(it.kind, 'number'); assert.ok(it.text && it.say && it.units.length);
  for (const u of it.units) assert.ok(u === ',' || app.NUMBER_UNITS.includes(u), `${u} has no clip`);
}

assert.equal(app.commonsMp3('Cs-dům.ogg', '3e'), 'https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3e/Cs-d%C5%AFm.ogg/Cs-d%C5%AFm.ogg.mp3');
console.log('all tests passed');
