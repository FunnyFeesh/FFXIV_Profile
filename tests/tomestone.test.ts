/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Run from the Vencord root: node --import tsx --test src/userplugins/ffxivProfile.desktop/tests/*.test.ts
// Uses ../tomestone-profile.json (a real profile response). Assertions never include its personal values.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { SAVAGE_TIERS, ULTIMATES } from "../constants";
import { parseTomestoneProfile } from "../parsers/tomestone";

const fixturePath = process.env.FFXIV_FIXTURE ?? join(process.cwd(), "..", "tomestone-profile.json");
// The fixture file starts with a UTF-8 BOM
const fixture = () => JSON.parse(readFileSync(fixturePath, "utf8").replace(/^﻿/, ""));

function parseOk(json: unknown) {
    const res = parseTomestoneProfile(json);
    assert.equal(res.status, "ok");
    if (res.status !== "ok") throw new Error("unreachable");
    return res.data;
}

test("fixture: identity, art and jobs", () => {
    const { character } = parseOk(fixture());
    assert.ok(character.name);
    assert.ok(character.world);
    assert.ok(character.dataCenter);
    assert.ok(character.activeJob);
    assert.ok(character.itemLevel && character.itemLevel > 0);
    assert.match(character.lodestonePortraitUrl ?? "", /^https:\/\/img2\.finalfantasyxiv\.com\//);
    assert.match(character.customArt.portrait?.url ?? "", /^https:\/\/assets\.tomestone\.gg\//);
    assert.equal(typeof character.activeJobId, "number");
    assert.ok(character.jobs.every(j => typeof j.id === "number"));
    assert.ok(character.customArt.portrait?.position);
    assert.ok(character.jobs.some(j => j.role === "tanks"));
    assert.ok(character.jobs.every(j => j.name && j.slug && typeof j.level === "number"));
});

test("fixture: every savage floor and ultimate in constants is present", () => {
    const { encounters } = parseOk(fixture());
    for (const tier of Object.values(SAVAGE_TIERS))
        for (const floor of tier.floors)
            assert.ok(encounters[floor.canonicalName], `missing ${floor.canonicalName}`);
    for (const u of Object.values(ULTIMATES))
        assert.ok(encounters[u.canonicalName], `missing ${u.canonicalName}`);
});

test("fixture: M12S P1 and P2 are separate encounters", () => {
    const { encounters } = parseOk(fixture());
    assert.ok(encounters.lindwurm);
    assert.ok(encounters["lindwurm-ii"]);
});

test("fixture: every encounter has a banner image", () => {
    const { encounters } = parseOk(fixture());
    for (const e of Object.values(encounters)) assert.match(e.bannerUrl ?? "", /^https:\/\/assets\.tomestone\.gg\//);
});

test("fixture: ultimate prog is read from progression", () => {
    const { encounters } = parseOk(fixture());
    const inProg = Object.values(ULTIMATES).map(u => encounters[u.canonicalName]).filter(e => e.progPoint);
    assert.ok(inProg.length > 0);
    for (const e of inProg) {
        assert.match(e.progPoint!, /% P\d/);
        assert.equal(typeof e.progPercent, "number");
        assert.equal(e.progPrivate, false);
    }
});

test("fixture: active savage progression target", () => {
    const { activeProgression } = parseOk(fixture());
    assert.ok(activeProgression.savage?.name);
});

test("lodestone bio marker makes the profile private", () => {
    const json = fixture();
    json.profile.bio = "raiding stuff tomestone-hidden";
    assert.deepEqual(parseTomestoneProfile(json), { status: "private" });
});

const minimal = (encounters: object) => ({ name: "A B", server: "W", datacenter: "D", encounters });

test("private progression hides the prog point", () => {
    const data = parseOk(minimal({
        ultimate: [{ canonicalName: "u", progression: { displayPercent: "50% P3", rawPercent: 50, mechanic: { name: "X" }, private: true } }],
    }));
    assert.deepEqual(data.encounters.u, { bannerUrl: null, cleared: false, progPoint: null, progMechanic: null, progPercent: null, progPrivate: true });
});

test("tier entry duplicating floor 4 merges instead of overwriting", () => {
    const data = parseOk(minimal({
        savage: [{
            canonicalName: "boss-4",
            achievement: null,
            encounters: [{ canonicalName: "boss-4", activity: { completedAt: 1 } }],
        }],
    }));
    assert.equal(data.encounters["boss-4"].cleared, true);
});

test("clear comes from achievement or activity", () => {
    const data = parseOk(minimal({
        ultimate: [
            { canonicalName: "a", achievement: { completedAt: "2025-01-01" } },
            { canonicalName: "b", activity: { completedAt: 1700000000 } },
            { canonicalName: "c" },
        ],
    }));
    assert.equal(data.encounters.a.cleared, true);
    assert.equal(data.encounters.b.cleared, true);
    assert.equal(data.encounters.c.cleared, false);
});

test("missing custom images and nulls don't throw", () => {
    const data = parseOk({ name: "A B", server: "W", datacenter: "D", customImages: null, encounters: null, profile: null });
    assert.deepEqual(data.character.customArt, { portrait: undefined, banner: undefined, avatar: undefined });
    assert.deepEqual(data.character.jobs, []);
});

test("garbage input is an error", () => {
    assert.equal(parseTomestoneProfile(null).status, "error");
    assert.equal(parseTomestoneProfile({ foo: 1 }).status, "error");
});
