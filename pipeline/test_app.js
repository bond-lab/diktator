// Unit tests for the pure helpers in app/app.js. Run: node pipeline/test_app.js
const assert = require('node:assert/strict');
const path = require('node:path');
const app = require(path.join(__dirname, '..', 'app', 'app.js'));

assert.deepEqual(app.spellingUnits('chléb'), ['ch', 'l', 'é', 'b']);
assert.deepEqual(app.spellingUnits('Pochod'), ['p', 'o', 'ch', 'o', 'd']);
assert.deepEqual(app.spellingUnits('dům'), ['d', 'ů', 'm']);
for (const u of app.spellingUnits('příšerně hřích žluťoučký kůň')) assert.ok(app.LETTER_NAMES[u], `no name for ${u}`);

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

const rng = { randInt: (lo) => lo, choice: (a) => a[0] };
assert.deepEqual(app.makeNumberItem(['date'], rng), { kind: 'number', text: '1.1.1900', say: 'prvního ledna 1900', hint: 'date as d. m. yyyy' });
assert.deepEqual(app.makeNumberItem(['time'], rng), { kind: 'number', text: '0:00', say: '0 hodin 0 minut', hint: 'time as hh:mm' });
assert.equal(app.makeNumberItem(['year'], rng).say, 'rok 1500');
for (let i = 0; i < 200; i += 1) {
  const it = app.makeNumberItem(['small', 'medium', 'large', 'year', 'date', 'time']);
  assert.equal(it.kind, 'number'); assert.ok(it.text && it.say);
}

assert.equal(app.commonsMp3('Cs-dům.ogg', '3e'), 'https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3e/Cs-d%C5%AFm.ogg/Cs-d%C5%AFm.ogg.mp3');
console.log('all tests passed');
