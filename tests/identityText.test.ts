/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseIdentityText, parseLinkInput } from "../services/identityText";

test("link dialog input", () => {
    assert.deepEqual(parseLinkInput(" 12345678 "), { lodestoneId: "12345678" });
    assert.deepEqual(parseLinkInput("Tata Taru @ Gilgamesh"), { name: "Tata Taru", world: "Gilgamesh" });
    assert.deepEqual(parseLinkInput("https://tomestone.gg/character/5/x"), { lodestoneId: "5" });
    assert.equal(parseLinkInput("Tata Taru"), null);
    assert.equal(parseLinkInput(""), null);
});

test("Lodestone URLs on any region", () => {
    assert.deepEqual(parseIdentityText("main: https://na.finalfantasyxiv.com/lodestone/character/12345678/"), { lodestoneId: "12345678" });
    assert.deepEqual(parseIdentityText("eu.finalfantasyxiv.com/lodestone/character/42"), { lodestoneId: "42" });
});

test("Tomestone URLs", () => {
    assert.deepEqual(parseIdentityText("https://tomestone.gg/character/87654321/tata-taru"), { lodestoneId: "87654321" });
});

test("ffxiv: and lodestone: ID tags", () => {
    assert.deepEqual(parseIdentityText("ffxiv:123"), { lodestoneId: "123" });
    assert.deepEqual(parseIdentityText("Lodestone: 456 (alt)"), { lodestoneId: "456" });
});

test("name @ world tags", () => {
    assert.deepEqual(parseIdentityText("static PF | ffxiv: Tata Taru @ Gilgamesh"), { name: "Tata Taru", world: "Gilgamesh" });
    assert.deepEqual(parseIdentityText("FFXIV:Y'shtola Rhul@Sargatanas"), { name: "Y'shtola Rhul", world: "Sargatanas" });
});

test("FFLogs name URLs, but not FFLogs ID URLs", () => {
    assert.deepEqual(parseIdentityText("https://www.fflogs.com/character/na/gilgamesh/Tata%20Taru"), { name: "Tata Taru", world: "gilgamesh" });
    assert.equal(parseIdentityText("https://www.fflogs.com/character/id/999"), null);
});

test("IDs win over names when both appear", () => {
    assert.deepEqual(parseIdentityText("ffxiv: Tata Taru @ Gilgamesh / tomestone.gg/character/9/"), { lodestoneId: "9" });
});

test("nothing to find", () => {
    assert.equal(parseIdentityText(undefined), null);
    assert.equal(parseIdentityText(""), null);
    assert.equal(parseIdentityText("I play ffxiv on Gilgamesh!"), null);
    assert.equal(parseIdentityText("ffxiv: Someone"), null);
});
