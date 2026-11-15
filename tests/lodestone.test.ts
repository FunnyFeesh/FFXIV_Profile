/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { findExactCharacter, parseLodestoneProfile, parseLodestoneSearch } from "../parsers/lodestone";

// Synthetic markup copying the structure of live Lodestone pages (checked 2026-11-14); names are made up
const ICON_PLD = "https://lds-img.finalfantasyxiv.com/h/a/pld.png";
const ICON_BLU = "https://lds-img.finalfantasyxiv.com/h/b/blu.png";
const ICON_CRP = "https://lds-img.finalfantasyxiv.com/h/c/crp.png";

const PROFILE = `
<div class="frame__chara__face"> <img src="https://img2.finalfantasyxiv.com/f/abc_fc0.jpg?1" width="40" height="40" alt=""> </div>
<div class="frame__chara__box"><p class="frame__chara__title">Cruel Legend</p><p class="frame__chara__name">Testy O&#39;Tester</p>
<p class="frame__chara__world"><i class="xiv-lds xiv-lds-home-world js__tooltip" data-tooltip="Home World"></i>Gilgamesh [Aether]</p></div>
<div class="character__detail__image"><a href="https://img2.finalfantasyxiv.com/f/abc_fl0.jpg?1" class="js__image_popup"><img src="https://img2.finalfantasyxiv.com/f/abc_fl0.jpg?1"></a></div>
<div class="character__class__data"><p>LEVEL 100 </p><div class="character__class_icon"><img src="${ICON_PLD}" width="24" height="24" alt=""></div></div>
<div class="character__freecompany__name"><p>Free Company</p><h4><a href="/lodestone/freecompany/1/">Lavender &amp; Co</a></h4></div>
<div class="character__level__list"><ul><li><img src="${ICON_PLD}" width="24" height="24" alt="" class="js__tooltip"data-tooltip="Paladin / Gladiator">100</li></ul></div>
<div class="character__level__list"><ul><li><img src="${ICON_BLU}" width="24" height="24" alt="" class="js__tooltip"data-tooltip="Blue Mage (Limited Job)">80</li></ul></div>
<div class="character__level__list"><ul><li><img src="${ICON_CRP}" width="24" height="24" alt="" class="js__tooltip"data-tooltip="Carpenter">-</li></ul></div>
`;

test("profile: identity, art, active job and levels", () => {
    const c = parseLodestoneProfile(PROFILE);
    assert.ok(c);
    assert.equal(c.name, "Testy O'Tester");
    assert.equal(c.world, "Gilgamesh");
    assert.equal(c.dataCenter, "Aether");
    assert.equal(c.title, "Cruel Legend");
    assert.equal(c.freeCompany, "Lavender & Co");
    assert.equal(c.activeJob, "Paladin");
    assert.equal(c.activeJobLevel, 100);
    assert.equal(c.avatarUrl, "https://img2.finalfantasyxiv.com/f/abc_fc0.jpg?1");
    assert.equal(c.lodestonePortraitUrl, "https://img2.finalfantasyxiv.com/f/abc_fl0.jpg?1");
    assert.deepEqual(c.customArt, {});
    assert.deepEqual(c.jobs, [
        { role: "tanks", name: "Paladin", slug: "paladin", level: 100 },
        { role: "casters", name: "Blue Mage", slug: "blue-mage", level: 80 },
    ]);
});

test("profile: optional title and FC are undefined when absent", () => {
    const c = parseLodestoneProfile(PROFILE.replace(/<p class="frame__chara__title">[^<]*<\/p>/, "").replace(/<div class="character__freecompany__name">[\s\S]*?<\/div>/, ""));
    assert.equal(c?.title, undefined);
    assert.equal(c?.freeCompany, undefined);
});

test("profile: page without a character name is null", () => {
    assert.equal(parseLodestoneProfile("<html>Maintenance</html>"), null);
});

const entry = (id: string, name: string, world: string) =>
    `<a href="/lodestone/character/${id}/" class="entry__link"><div class="entry__chara__face"><img src="x.jpg"></div><div class="entry__box entry__box--world"><p class="entry__name">${name}</p><p class="entry__world"><i class="xiv-lds xiv-lds-home-world js__tooltip" data-tooltip="Home World"></i>${world}</p></div></a>`;

test("search: parses entries and only accepts an exact name + world", () => {
    const html = entry("11", "Tata Taru", "Gilgamesh [Aether]") + entry("22", "Tata Tarus", "Gilgamesh [Aether]") + entry("33", "Tata Taru", "Sargatanas [Aether]");
    const results = parseLodestoneSearch(html);
    assert.equal(results.length, 3);
    assert.deepEqual(results[0], { lodestoneId: "11", name: "Tata Taru", world: "Gilgamesh", dataCenter: "Aether" });
    assert.equal(findExactCharacter(results, " tata taru ", "gilgamesh")?.lodestoneId, "11");
    assert.equal(findExactCharacter(results, "Tata Taru", "Sargatanas")?.lodestoneId, "33");
    assert.equal(findExactCharacter(results, "Tata", "Gilgamesh"), null);
});
