/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFflogsQuery, FflogsMetric, FflogsScope, parseFflogsResponse } from "../parsers/fflogs";

const zoneCount = (q: string) => (q.match(/zoneRankings\(/g) ?? []).length;

test("core query: pinned tier as Savage and Normal, ultimates, all partitions, metric inlined", () => {
    const q = buildFflogsQuery("rdps", "core");
    assert.ok(q.includes("z73: zoneRankings(zoneID: 73, difficulty: 101, metric: rdps, partition: -1)"));
    assert.ok(q.includes("z73n: zoneRankings(zoneID: 73, difficulty: 100, metric: rdps, partition: -1)"));
    for (const zone of [65, 76, 59])
        assert.equal(q.split(`z${zone}: zoneRankings(zoneID: ${zone}, metric: rdps, partition: -1)`).length, 2, `zone ${zone}`);
    assert.equal(zoneCount(q), 5);
    assert.match(q, /character\(lodestoneID: \$id\)/);
    assert.match(q, /hidden/);
    assert.match(q, /rateLimitData/);
});

test("older-tier query: only that zone, Savage and Normal, all partitions", () => {
    const q = buildFflogsQuery("adps", "cruiserweight");
    assert.equal(zoneCount(q), 2);
    assert.ok(q.includes("z68: zoneRankings(zoneID: 68, difficulty: 101, metric: adps, partition: -1)"));
    assert.ok(q.includes("z68n: zoneRankings(zoneID: 68, difficulty: 100, metric: adps, partition: -1)"));
    assert.equal(zoneCount(buildFflogsQuery("rdps", "lightHeavyweight")), 2);
});

test("query rejects metrics and scopes outside the allowlist", () => {
    assert.throws(() => buildFflogsQuery("rdps) { evil }" as FflogsMetric, "core"));
    assert.throws(() => buildFflogsQuery("rdps", "toString" as FflogsScope));
});

const response = (character: unknown) => ({ data: { characterData: { character } } });

test("null character means not on FFLogs", () => {
    assert.deepEqual(parseFflogsResponse(response(null), "core"), { status: "not_found" });
});

test("hidden character is private", () => {
    assert.deepEqual(parseFflogsResponse(response({ hidden: true }), "core"), { status: "private" });
});

test("GraphQL errors without data are reported", () => {
    const res = parseFflogsResponse({ errors: [{ message: "bad field" }], data: null }, "core");
    assert.deepEqual(res, { status: "error", message: "bad field" });
});

const rank = (id: number, name: string, extra: object = {}) =>
    ({ encounter: { id, name }, rankPercent: 96.4, totalKills: 3, fastestKill: 512000, bestSpec: "BlackMage", ...extra });

test("older-tier scope reads only that tier's zone", () => {
    const res = parseFflogsResponse(response({
        hidden: false,
        z68: { rankings: [rank(97, "Dancing Green")] },
        z73: { rankings: [rank(101, "Vamp Fatale")] },
    }), "cruiserweight");
    assert.equal(res.status, "ok");
    if (res.status !== "ok") return;
    assert.deepEqual(Object.keys(res.data.encounters), ["dancing-green"]);
});

test("core scope maps rankings to canonical names by encounter ID", () => {
    const ok = parseFflogsResponse({
        data: {
            rateLimitData: { limitPerHour: 3600, pointsSpentThisHour: 12, pointsResetIn: 100 },
            characterData: {
                character: {
                    hidden: false,
                    z73: {
                        rankings: [
                            rank(101, "Vamp Fatale"),
                            rank(104, "Lindwurm", { rankPercent: null, totalKills: 0, fastestKill: 0, bestSpec: null }),
                            rank(105, "Lindwurm II"),
                            // Known name but unknown ID: IDs decide, not names
                            rank(999, "The Tyrant"),
                        ],
                    },
                    z68: { rankings: [rank(97, "Dancing Green")] },
                    z59: { rankings: [rank(1077, "The Omega Protocol"), rank(1073, "The Unending Coil of Bahamut")] },
                    z65: null,
                },
            },
        },
    }, "core");

    assert.equal(ok.status, "ok");
    if (ok.status !== "ok") return;
    const e = ok.data.encounters;

    assert.deepEqual(e["vamp-fatale"], { killCount: 3, bestPercent: 96.4, bestJob: "BlackMage", fastestKillMs: 512000 });
    assert.deepEqual(e.lindwurm, { killCount: 0, bestPercent: null, bestJob: null, fastestKillMs: null });
    assert.ok(e["lindwurm-ii"]);
    assert.equal(e["the-tyrant"], undefined);
    // Not in the core scope
    assert.equal(e["dancing-green"], undefined);
    assert.ok(e["the-omega-protocol-ultimate"]);
    assert.ok(e["the-unending-coil-of-bahamut-ultimate"]);
    assert.deepEqual(ok.data.rateLimit, { limitPerHour: 3600, pointsSpentThisHour: 12, pointsResetIn: 100 });
});

test("Normal-mode rankings never count as Savage", () => {
    const res = parseFflogsResponse(response({
        hidden: false,
        // FFLogs answered the Savage request with Normal rankings: ignored
        z73: { difficulty: 100, rankings: [rank(101, "Vamp Fatale")] },
        z73n: { difficulty: 100, rankings: [rank(102, "Red Hot and Deep Blue", { rankPercent: 54 })] },
    }), "core");
    assert.equal(res.status, "ok");
    if (res.status !== "ok") return;
    assert.deepEqual(res.data.encounters, {});
    assert.equal(res.data.normalEncounters["red-hot-deep-blue"].bestPercent, 54);
});

test("Savage rankings are read when FFLogs confirms the difficulty", () => {
    const res = parseFflogsResponse(response({ hidden: false, z73: { difficulty: 101, rankings: [rank(101, "Vamp Fatale")] }, z73n: null }), "core");
    assert.equal(res.status, "ok");
    if (res.status !== "ok") return;
    assert.ok(res.data.encounters["vamp-fatale"]);
    assert.deepEqual(res.data.normalEncounters, {});
});
