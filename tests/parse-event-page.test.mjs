import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEventPage } from '../scripts/lib/parse-event-page.mjs';
import { validateEventData } from '../scripts/lib/validate-data.mjs';

test('detects pending publication when no deck area exists', () => {
  const result = parseEventPage('<h1>Standard Challenge 32</h1>', {
    eventType: 'challenge',
  });
  assert.equal(result.status, 'pending_publication');
});

test('treats a redirect to the decklists index as pending publication', () => {
  const result = parseEventPage(
    '<html><body><div class="container-page-fluid decklists-page">Latest decklists</div></body></html>',
    { eventType: 'league' }
  );
  assert.equal(result.status, 'pending_publication');
  assert.equal(result.reason, 'decklists_not_published');
});

test('parses a league 5-0 deck', () => {
  const result = parseEventPage(
    `
    <h2>Player: Alice</h2>
    <p>Record: 5-0</p>
    <h3>Main Deck</h3>
    <p>4 Lightning Strike</p>
    <p>56 Mountain</p>
    <h3>Sideboard</h3>
    <p>2 Negate</p>
    `,
    { eventType: 'league' }
  );
  assert.equal(result.status, 'completed');
  assert.equal(result.decks[0].record, '5-0');
  assert.equal(result.decks[0].mainboardCount, 60);
});

test('keeps challenge partial top 8 pending', () => {
  const result = parseEventPage(
    `
    <h2>Place: 1</h2><p>Player: Alice</p><h3>Main Deck</h3><p>60 Island</p>
    <h2>Place: 2</h2><p>Player: Bob</p><h3>Main Deck</h3><p>60 Plains</p>
    `,
    { eventType: 'challenge' }
  );
  assert.equal(result.status, 'pending_publication');
});

test('distinguishes unreadable deck structure as parse_error', () => {
  const result = parseEventPage(
    `
    <h2>Decklist</h2>
    <p>Player: Alice</p>
    <h3>Main Deck</h3>
    <p>Lightning Strike without quantity</p>
    `,
    { eventType: 'league' }
  );
  assert.equal(result.status, 'parse_error');
});

test('parses current MTGO embedded challenge data as top 8 only', () => {
  const html = `
    <script>
      window.MTGO = {};
      window.MTGO.decklists = {};
      window.MTGO.decklists.data = {
        "description": "Standard Challenge 32",
        "decklists": [
          ${Array.from({ length: 9 }, (_, index) => `{
            "loginid": "${index + 1}",
            "player": "Player ${index + 1}",
            "main_deck": [{"qty": "60", "card_attributes": {"card_name": "Island"}}],
            "sideboard_deck": [{"qty": "15", "card_attributes": {"card_name": "Negate"}}]
          }`).join(',')}
        ],
        "standings": [
          ${Array.from({ length: 9 }, (_, index) => `{
            "loginid": "${index + 1}",
            "rank": "${index + 1}"
          }`).join(',')}
        ]
      };
    </script>
  `;
  const result = parseEventPage(html, { eventType: 'challenge' });
  assert.equal(result.status, 'completed');
  assert.equal(result.decks.length, 8);
  assert.equal(result.decks[0].placement, 1);
  assert.equal(result.decks[7].placement, 8);
});

test('parses current MTGO embedded league data as 5-0 decks', () => {
  const html = `
    <script>
      window.MTGO = {};
      window.MTGO.decklists = {};
      window.MTGO.decklists.data = {
        "decklists": [{
          "loginid": "1",
          "player": "League Player",
          "wins": {"wins": "5", "losses": "0"},
          "main_deck": [{"qty": "60", "card_attributes": {"card_name": "Mountain"}}],
          "sideboard_deck": []
        }]
      };
    </script>
  `;
  const result = parseEventPage(html, { eventType: 'league' });
  assert.equal(result.status, 'completed');
  assert.equal(result.decks[0].record, '5-0');
});

test('uses the MTGO course id to distinguish repeated league players', () => {
  const deck = (courseId, cardName) => `{
    "loginplayeventcourseid": "${courseId}",
    "loginid": "42",
    "player": "Repeat Player",
    "wins": {"wins": "5", "losses": "0"},
    "main_deck": [{
      "leaguedeckid": "${courseId}0",
      "qty": "60",
      "card_attributes": {"card_name": "${cardName}"}
    }],
    "sideboard_deck": []
  }`;
  const html = `
    <script>
      window.MTGO = {};
      window.MTGO.decklists = {};
      window.MTGO.decklists.data = {
        "decklists": [
          ${deck('1001', 'Forest')},
          ${deck('1002', 'Island')}
        ]
      };
    </script>
  `;

  const result = parseEventPage(html, { eventType: 'league' });

  assert.equal(result.status, 'completed');
  assert.deepEqual(
    result.decks.map((entry) => entry.id),
    ['1001-repeat-player', '1002-repeat-player']
  );
  assert.equal(new Set(result.decks.map((entry) => entry.id)).size, 2);
});

test('event validation rejects duplicate deck ids', () => {
  const deck = {
    id: 'duplicate',
    player: 'Repeat Player',
    placement: null,
    record: '5-0',
    mainboard: [{ quantity: 60, nameEn: 'Forest' }],
    sideboard: [],
  };

  assert.throws(
    () => validateEventData({
      event: {
        id: 'event',
        eventType: 'league',
        sourceUrl: 'https://www.mtgo.com/decklist/event',
        status: 'completed',
      },
      decks: [deck, { ...deck }],
    }),
    /duplicate id duplicate/
  );
});

test('event validation rejects duplicate card rows within the same zone', () => {
  assert.throws(
    () => validateEventData({
      event: {
        id: 'event',
        eventType: 'league',
        sourceUrl: 'https://www.mtgo.com/decklist/event',
        status: 'completed',
      },
      decks: [{
        id: 'deck',
        player: 'Player',
        placement: null,
        record: '5-0',
        mainboard: [
          { quantity: 1, nameEn: 'Rest in Peace' },
          { quantity: 2, nameEn: ' REST  IN PEACE ' },
        ],
        sideboard: [],
      }],
    }),
    /duplicate mainboard card/
  );
});
