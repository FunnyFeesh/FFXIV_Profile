/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { REFRESH_COOLDOWN_MS } from "../constants";
import { parseTomestoneProfile } from "../parsers/tomestone";
import { applyTierFflogs, buildPassport, FreshnessContext, isFresh, refreshDecision } from "../services/passportModel";
import type { CharacterInfo, FetchResult, FflogsData, TomestoneData } from "../types";

const fixturePath = process.env.FFXIV_FIXTURE ?? join(process.cwd(), "..", "tomestone-profile.json");
const tomestone = parseTomestoneProfile(JSON.parse(readFileSync(fixturePath, "utf8").replace(/^﻿/, ""))) as FetchResult<TomestoneData>;

const ff = (encounters: FflogsData["encounters"]): FetchResult<FflogsData> => ({ status: "ok", data: { encounters, rateLimit: null } });
const kill = (killCount: number, bestPercent: number | null = 90) => ({ killCount, bestPercent, bestJob: "Pictomancer", fastestKillMs: 400000 });

const LODESTONE_CHAR: CharacterInfo = { name: "L C", world: "W", dataCenter: "D", customArt: {}, jobs: [] };

test("merges FFLogs numbers with Tomestone clears and prog", () => {
    const p = buildPassport("1", "rdps", 1000, {
        fflogs: ff({ "vamp-fatale": kill(3, 96.4), "the-weapons-refrain-ultimate": kill(1) }),
        tomestone,
        lodestone: null,
    });

    assert.deepEqual(p.sources, { fflogs: "ok", tomestone: "ok", lodestone: "skipped" });
    assert.deepEqual(p.tierFflogs, { heavyweight: "ok", cruiserweight: "skipped", lightHeavyweight: "skipped" });
    assert.ok(p.character?.name);

    const m9s = p.savageTiers.heavyweight[0];
    assert.equal(m9s.shortName, "M9S");
    assert.equal(m9s.cleared, true);
    assert.equal(m9s.killCount, 3);
    assert.equal(m9s.bestPercent, 96.4);

    // Not in FFLogs response but FFLogs answered: 0 kills, not unknown
    assert.equal(p.savageTiers.heavyweight[2].killCount, 0);
    assert.equal(p.savageTiers.heavyweight.length, 5);

    // Ultimate prog comes from Tomestone
    assert.ok(Object.values(p.ultimates).some(u => u.progPoint));
    assert.ok(p.activeProgression.savage);
});

test("Tomestone clear counts even with no FFLogs kill; older tiers have unknown FFLogs numbers", () => {
    const p = buildPassport("1", "rdps", 1000, { fflogs: ff({}), tomestone, lodestone: null });
    // The fixture has a Tomestone M4S clear that FFLogs doesn't know about
    const m4s = p.savageTiers.lightHeavyweight[3];
    assert.equal(m4s.cleared, true);
    assert.equal(m4s.killCount, null);
    assert.equal(m4s.bestPercent, null);
});

test("no FFLogs token: numbers unknown, clears still from Tomestone", () => {
    const p = buildPassport("1", "rdps", 1000, { fflogs: { status: "no_token" }, tomestone, lodestone: null });
    assert.equal(p.sources.fflogs, "no_token");
    assert.equal(p.tierFflogs.heavyweight, "no_token");
    assert.ok(Object.values(p.savageTiers.heavyweight).every(e => e.killCount === null));
    assert.ok(p.savageTiers.heavyweight[0].cleared);
});

test("no Tomestone: identity from Lodestone, no prog", () => {
    const p = buildPassport("1", "rdps", 1000, {
        fflogs: ff({ "vamp-fatale": kill(2) }),
        tomestone: { status: "no_token" },
        lodestone: { status: "ok", data: LODESTONE_CHAR },
    });
    assert.deepEqual(p.sources, { fflogs: "ok", tomestone: "no_token", lodestone: "ok" });
    assert.equal(p.character, LODESTONE_CHAR);
    assert.equal(p.savageTiers.heavyweight[0].cleared, true);
    assert.ok(Object.values(p.ultimates).every(u => u.progPoint === null));
    assert.deepEqual(p.activeProgression, { savage: null, ultimate: null });
});

test("everything failed: no character, nothing cleared", () => {
    const p = buildPassport("1", "rdps", 1000, {
        fflogs: { status: "not_found" },
        tomestone: { status: "error", message: "x" },
        lodestone: { status: "error", message: "y" },
    });
    assert.equal(p.character, null);
    assert.ok(Object.values(p.ultimates).every(u => !u.cleared));
});

test("applyTierFflogs overlays an older tier and keeps Tomestone clears", () => {
    const base = buildPassport("1", "rdps", 1000, { fflogs: ff({}), tomestone, lodestone: null });
    const p = applyTierFflogs(base, "lightHeavyweight", ff({ "black-cat": kill(5, 80) }));

    assert.equal(p.tierFflogs.lightHeavyweight, "ok");
    assert.equal(p.tierFflogs.cruiserweight, "skipped");
    const [m1s, , , m4s] = p.savageTiers.lightHeavyweight;
    assert.deepEqual([m1s.cleared, m1s.killCount, m1s.bestPercent], [true, 5, 80]);
    assert.deepEqual([m4s.cleared, m4s.killCount], [true, 0]);
    // Other tiers untouched, input not mutated
    assert.equal(p.savageTiers.heavyweight, base.savageTiers.heavyweight);
    assert.equal(base.tierFflogs.lightHeavyweight, "skipped");

    const failed = applyTierFflogs(base, "cruiserweight", { status: "error", message: "x" });
    assert.equal(failed.tierFflogs.cruiserweight, "error");
    assert.ok(failed.savageTiers.cruiserweight.every(e => e.killCount === null));
});

const HOUR = 3_600_000;
const ctx = (over: Partial<FreshnessContext> = {}): FreshnessContext =>
    ({ now: 10 * HOUR, ttlMs: 3 * HOUR, metric: "rdps", credentialsChangedAt: 0, ...over });
const passportAt = (fetchedAt: number, over: Partial<Parameters<typeof buildPassport>[3]> = {}) =>
    buildPassport("1", "rdps", fetchedAt, { fflogs: ff({}), tomestone, lodestone: null, ...over });

test("freshness: TTL, metric, credential changes and transient errors", () => {
    assert.equal(isFresh(passportAt(9 * HOUR), ctx()), true);
    assert.equal(isFresh(passportAt(7 * HOUR), ctx()), false);
    assert.equal(isFresh(passportAt(9 * HOUR), ctx({ metric: "adps" })), false);
    assert.equal(isFresh(passportAt(9 * HOUR), ctx({ credentialsChangedAt: 9.5 * HOUR })), false);
    assert.equal(isFresh(passportAt(9 * HOUR, { fflogs: { status: "error", message: "x" } }), ctx()), false);
    // Missing tokens aren't retried until credentials change
    assert.equal(isFresh(passportAt(9 * HOUR, { fflogs: { status: "no_token" } }), ctx()), true);
});

test("refresh: normal click only when stale, shift-click forces, both wait for the cooldown", () => {
    assert.equal(refreshDecision(null, ctx(), false), "fetch");

    const fresh = passportAt(9 * HOUR);
    assert.equal(refreshDecision(fresh, ctx(), false), "fresh");
    assert.equal(refreshDecision(fresh, ctx(), true), "fetch");

    const stale = passportAt(6 * HOUR);
    assert.equal(refreshDecision(stale, ctx(), false), "fetch");

    const justFetched = passportAt(10 * HOUR - REFRESH_COOLDOWN_MS + 1);
    assert.equal(refreshDecision(justFetched, ctx(), true), "cooldown");
    assert.equal(refreshDecision(justFetched, ctx({ metric: "adps" }), false), "cooldown");
    assert.equal(refreshDecision(passportAt(10 * HOUR - REFRESH_COOLDOWN_MS), ctx(), true), "fetch");
});
