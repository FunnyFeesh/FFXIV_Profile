/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { dataCenterFromRoles, isCharacterName, isFfxivActivity, parseNickname, parseRichPresence } from "../services/detectText";
import { dataCenterOf, findDataCenter, findWorld, WORLDS_BY_DC } from "../services/worlds";

test("world list", () => {
    assert.equal(Object.values(WORLDS_BY_DC).flat().length, 85);
    assert.equal(findWorld("gilgamesh"), "Gilgamesh");
    assert.equal(findWorld("Gilgamesh "), "Gilgamesh");
    assert.equal(findWorld("Mentor"), null);
    assert.equal(dataCenterOf("Cuchulainn"), "Dynamis");
    assert.equal(findDataCenter("aether"), "Aether");
});

test("character name rules", () => {
    assert.ok(isCharacterName("Tata Taru"));
    assert.ok(isCharacterName("Y'shtola Rhul"));
    assert.ok(isCharacterName("Ka-el Nox"));
    assert.ok(!isCharacterName("Tata"));
    assert.ok(!isCharacterName("A Taru"));
    assert.ok(!isCharacterName("Tata Taru Third"));
    // 21 letters combined
    assert.ok(!isCharacterName("Abcdefghijk Abcdefghij"));
    assert.ok(!isCharacterName("Tata T4ru"));
});

test("nicknames in the common shapes", () => {
    assert.deepEqual(parseNickname("Tata Taru"), { name: "Tata Taru" });
    assert.deepEqual(parseNickname("Tata Taru (Gilgamesh)"), { name: "Tata Taru", world: "Gilgamesh" });
    assert.deepEqual(parseNickname("Tata Taru [gilgamesh]"), { name: "Tata Taru", world: "Gilgamesh" });
    assert.deepEqual(parseNickname("Tata Taru @ Siren"), { name: "Tata Taru", world: "Siren" });
    assert.deepEqual(parseNickname("Tata Taru@Siren"), { name: "Tata Taru", world: "Siren" });
    assert.deepEqual(parseNickname("[RAID] Tata Taru"), { name: "Tata Taru" });
    assert.deepEqual(parseNickname("Tats | Tata Taru"), { name: "Tata Taru" });
    assert.deepEqual(parseNickname("Tata Taru | Tank"), { name: "Tata Taru" });
    assert.deepEqual(parseNickname("🌸 Tata Taru 🌸"), { name: "Tata Taru" });
    assert.deepEqual(parseNickname("Y'shtola Rhul • Sargatanas"), { name: "Y'shtola Rhul" });
});

test("nicknames that aren't character names", () => {
    assert.equal(parseNickname("Tata T."), null);
    assert.equal(parseNickname("tata"), null);
    assert.equal(parseNickname("tata taru"), null);
    assert.equal(parseNickname("Tata Taru (Mentor)"), null);
    assert.equal(parseNickname("Tata Taru @ Narnia"), null);
    assert.equal(parseNickname("The Best Healer"), null);
    assert.equal(parseNickname(""), null);
    assert.equal(parseNickname(undefined), null);
});

const rp = (details?: string, state?: string, largeText?: string) => ({
    name: "FINAL FANTASY XIV", application_id: "478143453536976896", details, state, assets: { large_text: largeText },
});

test("Rich Presence: name with the current world as home world", () => {
    assert.deepEqual(parseRichPresence(rp("Tata Taru", "Gilgamesh", "Limsa Lominsa")), { name: "Tata Taru", world: "Gilgamesh" });
});

test("Rich Presence: FC tag anchors the name even in a duty", () => {
    assert.deepEqual(parseRichPresence(rp("Tata Taru «TAG»", "Gilgamesh", "Limsa Lominsa")), { name: "Tata Taru", world: "Gilgamesh" });
    assert.deepEqual(parseRichPresence(rp("Tata Taru «TAG»", "In a duty", "Somewhere")), { name: "Tata Taru" });
});

test("Rich Presence: visiting uses the ❀ home world, not the current one", () => {
    assert.deepEqual(parseRichPresence(rp("Tata Taru ❀ Siren", "Gilgamesh", "Ul'dah")), { name: "Tata Taru", world: "Siren" });
});

test("Rich Presence without a name", () => {
    // Name hidden: details is the zone, same as the large image text
    assert.equal(parseRichPresence(rp("Old Sharlayan", "Gilgamesh", "Old Sharlayan")), null);
    // Menus and login queue: no world, no FC tag
    assert.equal(parseRichPresence(rp("In Menus")), null);
    assert.equal(parseRichPresence(rp("In Login Queue (#12)", "ETA: 0:05:00")), null);
    // A name with nothing to anchor it
    assert.equal(parseRichPresence(rp("Tata Taru", "In a duty", "Somewhere")), null);
    assert.equal(parseRichPresence(rp(undefined, "Gilgamesh")), null);
});

test("FFXIV activity detection", () => {
    assert.ok(isFfxivActivity({ application_id: "478143453536976896" }));
    assert.ok(isFfxivActivity({ name: "FINAL FANTASY XIV Online" }));
    assert.ok(!isFfxivActivity({ name: "Spotify" }));
});

test("data-center hint from roles", () => {
    assert.equal(dataCenterFromRoles(["Member", "Aether"]), "Aether");
    assert.equal(dataCenterFromRoles(["Gilgamesh", "Raider"]), "Aether");
    assert.equal(dataCenterFromRoles(["Gilgamesh", "Aether", "🌸 Siren"]), "Aether");
    assert.equal(dataCenterFromRoles(["Gilgamesh", "Balmung"]), null);
    assert.equal(dataCenterFromRoles(["Member"]), null);
});
