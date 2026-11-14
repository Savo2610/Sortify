import assert from "node:assert/strict";
import { test } from "node:test";
import { Walker } from "../src/lib/source";
import { LIKED } from "../src/lib/types";
import type { Api, Track } from "../src/lib/types";

// Eine Quelle als einfache Liste in Spotify-Reihenfolge.
function fake(ids: string[]) {
  const list = [...ids];
  let requests = 0;
  const api = {
    async page(_source: string, offset: number, limit: number) {
      requests++;
      const tracks = list
        .slice(offset, offset + limit)
        .map((id, i) => ({ id, uri: id, index: offset + i }) as Track);
      return { total: list.length, count: tracks.length, tracks };
    },
  } as unknown as Api;
  return { api, list, requests: () => requests };
}

const range = (n: number, prefix = "t") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

async function drain(walker: Walker, each?: (track: Track) => void) {
  const out: string[] = [];
  for (let page = await walker.next(); page; page = await walker.next()) {
    for (const t of page) {
      out.push(t.id);
      each?.(t);
    }
  }
  return out;
}

test("Lieblingssongs von hinten: älteste zuerst, jeder Song genau einmal", async () => {
  const { api, list } = fake(range(240));
  const walker = new Walker(api, LIKED, -1);
  await walker.init();
  assert.deepEqual(await drain(walker), [...list].reverse());
});

test("Playlist von vorn", async () => {
  const { api, list } = fake(range(123));
  const walker = new Walker(api, "pl", 1);
  await walker.init();
  assert.deepEqual(await drain(walker), list);
});

test("Löschen gehörter Songs lässt keinen Song aus (beide Richtungen)", async () => {
  for (const dir of [1, -1] as const) {
    const { api, list } = fake(range(240));
    const expected = dir === 1 ? [...list] : [...list].reverse();
    const walker = new Walker(api, dir === 1 ? "pl" : LIKED, dir);
    await walker.init();
    const got = await drain(walker, (t) => {
      // Jeder dritte Song wird nach dem Hören aus der Quelle gelöscht.
      if (Number(t.id.slice(1)) % 3 === 0) {
        list.splice(list.indexOf(t.id), 1);
        walker.shifted(-1);
      }
    });
    assert.deepEqual(got, expected, `dir ${dir}`);
  }
});

test("Neue Lieblingssongs während des Durchlaufs verschieben nichts", async () => {
  const { api, list } = fake(range(200));
  const expected = [...list].reverse();
  const walker = new Walker(api, LIKED, -1);
  await walker.init();
  let n = 0;
  const got = await drain(walker, () => {
    if (++n === 60) list.unshift("neu1", "neu2", "neu3");
  });
  assert.deepEqual(got, [...expected, "neu3", "neu2", "neu1"]);
});

test("Wiedereinstieg mit Hinweis: blättert nicht alles neu und findet trotzdem jeden Song", async () => {
  const { api, list, requests } = fake(range(1000));
  const first = new Walker(api, LIKED, -1);
  await first.init();
  // 600 Songs hören, dann aufhören.
  const heard: Track[] = [];
  while (heard.length < 600) heard.push(...(await first.next())!);
  const last = heard[599];
  const hint = first.hintFor(last);

  // In der Zwischenzeit kommen fünf neue Lieblingssongs dazu.
  list.unshift(...range(5, "neu"));
  const before = requests();
  const second = new Walker(api, LIKED, -1, hint);
  await second.init();
  const page = (await second.next())!;
  assert.ok(requests() - before <= 2, "Einstieg braucht höchstens zwei Anfragen");
  const seen = new Set(heard.slice(0, 600).map((t) => t.id));
  // Sicherheitsabstand: die erste Seite liegt noch ganz im schon Gehörten.
  assert.ok(page.every((t) => seen.has(t.id)));

  const rest = [...page.map((t) => t.id), ...(await drain(second))];
  const unheard = list.filter((id) => !seen.has(id));
  for (const id of unheard) assert.ok(rest.includes(id), `${id} fehlt`);
  assert.equal(new Set(rest).size, rest.length, "kein Song doppelt");
});

test("Hinweis einer geschrumpften Liste: der Schlussdurchlauf findet den Rest", async () => {
  const { api, list } = fake(range(300));
  const walker = new Walker(api, "pl", 1, { cursor: 250, total: 400 });
  await walker.init();
  const got = await drain(walker);
  assert.deepEqual([...got].sort(), [...list].sort());
});

test("Leere Quelle", async () => {
  const { api } = fake([]);
  for (const dir of [1, -1] as const) {
    const walker = new Walker(api, "pl", dir);
    await walker.init();
    assert.equal(await walker.next(), null);
    assert.equal(await walker.next(), null);
  }
});
