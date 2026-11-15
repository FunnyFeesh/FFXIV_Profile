/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Live check of the FFLogs and Tomestone APIs through the plugin's own request + parse code.
// Run via dev/check-live.ps1, which prompts for credentials without echoing them.
// Prints only statuses, field names, types and game-content names (encounters, zones);
// never credentials, character names, IDs or parse values.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fflogsQuery, requestFflogs, requestTomestone, tomestoneProfileJson } from "../api";
import { CURRENT_SAVAGE_TIER, SAVAGE_TIERS, ULTIMATES } from "../constants";
import { buildFflogsQuery, parseFflogsResponse } from "../parsers/fflogs";

const { env } = process;
const fixturePath = join(process.cwd(), "..", "tomestone-profile.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8").replace(/^﻿/, ""));
const lodestoneId = env.FFXIV_LODESTONE_ID || String(fixture.id);

const typeOf = (v: unknown) => Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
const keys = (o: unknown) => o && typeof o === "object" ? Object.keys(o).sort() : [];

const expectedNames = [
    ...Object.values(SAVAGE_TIERS).flatMap(t => t.floors.map(f => f.canonicalName)),
    ...Object.values(ULTIMATES).map(u => u.canonicalName),
];

async function checkFflogs() {
    console.log("\n=== FFLogs ===");
    const clientId = env.FFXIV_FFLOGS_ID, clientSecret = env.FFXIV_FFLOGS_SECRET;
    if (!clientId || !clientSecret) return console.log("skipped (no credentials entered)");
    const creds = { clientId, clientSecret };

    const pointsSpent = async () => {
        const r = await fflogsQuery(creds, "{ rateLimitData { pointsSpentThisHour } }");
        return r.status === "ok" ? (r.data as any).data?.rateLimitData?.pointsSpentThisHour as number : NaN;
    };

    const before = await pointsSpent();
    const raw = await fflogsQuery(creds, buildFflogsQuery("rdps", "core"), { id: Number(lodestoneId) });
    const after = await pointsSpent();
    // Includes the cost of one tiny rateLimitData query
    console.log(`points for one passport query: ~${(after - before).toFixed(2)}`);
    console.log("request status:", raw.status, raw.status !== "ok" ? raw.message ?? "" : "");
    if (raw.status !== "ok") return;

    const body = raw.data as any;
    if (body.errors) console.log("graphql errors:", body.errors.map((e: any) => e.message));
    console.log("rate limit:", body.data?.rateLimitData);

    const character = body.data?.characterData?.character;
    console.log("character:", character === null ? "null (not on FFLogs)" : typeOf(character), "| hidden:", character?.hidden);

    for (const [alias, zone] of Object.entries(character ?? {})) {
        if (alias === "hidden") continue;
        const z = zone as any;
        console.log(`\n${alias}: ${typeOf(z)} partition=${z?.partition} keys=${JSON.stringify(keys(z))}`);
        const rankings: any[] = z?.rankings ?? [];
        if (rankings[0]) console.log("  ranking keys:", JSON.stringify(keys(rankings[0])));
        for (const r of rankings) {
            console.log(`  encounter ${r.encounter?.id} "${r.encounter?.name}": totalKills=${typeOf(r.totalKills)}(${r.totalKills > 0 ? ">0" : "0"}) rankPercent=${typeOf(r.rankPercent)} fastestKill=${typeOf(r.fastestKill)} bestSpec=${typeOf(r.bestSpec)} spec=${typeOf(r.spec)}`);
        }
    }

    const parsed = parseFflogsResponse(body, "core");
    const coreNames = [
        ...SAVAGE_TIERS[CURRENT_SAVAGE_TIER].floors.map(f => f.canonicalName),
        ...Object.values(ULTIMATES).map(u => u.canonicalName),
    ];
    console.log("\nparse status:", parsed.status);
    if (parsed.status === "ok") {
        const got = Object.keys(parsed.data.encounters);
        console.log(`core: mapped ${got.length}/${coreNames.length} encounters`);
        console.log("not mapped:", coreNames.filter(n => !got.includes(n)));
    }

    // Encounter IDs per zone, to replace the nulls in constants.ts
    const zoneIds = [...new Set([...Object.values(SAVAGE_TIERS).map(t => t.fflogsZoneId), ...Object.values(ULTIMATES).map(u => u.fflogsZoneId)])];
    const zq = `{ worldData { ${zoneIds.map(id => `z${id}: zone(id: ${id}) { name encounters { id name } partitions { id name compactName default } }`).join(" ")} } }`;
    const zres = await fflogsQuery(creds, zq);
    console.log("\nzone encounter lists:");
    if (zres.status !== "ok") return console.log("  failed:", zres.status, zres.message ?? "");
    for (const [alias, z] of Object.entries((zres.data as any).data?.worldData ?? {})) {
        const zone = z as any;
        console.log(`  ${alias} ${zone?.name}: ${zone?.encounters?.map((e: any) => `${e.id}=${e.name}`).join(", ")}`);
        console.log(`    partitions: ${zone?.partitions?.map((p: any) => `${p.id}=${p.compactName ?? p.name}${p.default ? " (default)" : ""}`).join(", ")}`);
    }

    // Through the same function native.ts calls
    for (const scope of ["core", "cruiserweight", "lightHeavyweight"] as const) {
        const viaApi = await requestFflogs(creds, lodestoneId, "rdps", scope);
        const n = viaApi.status === "ok" ? Object.keys(viaApi.data.encounters).length : 0;
        console.log(`requestFflogs(${scope}): ${viaApi.status}, ${n} encounters`);
    }
}

async function checkTomestone() {
    console.log("\n=== Tomestone ===");
    const token = env.FFXIV_TOMESTONE_TOKEN;
    if (!token) return console.log("skipped (no token entered)");

    const raw = await tomestoneProfileJson(token, lodestoneId);
    console.log("request status:", raw.status, raw.status !== "ok" ? raw.message ?? "" : "");
    if (raw.status !== "ok") return;

    // Structural drift between the live response and the fixture
    const live = raw.data as any;
    const diff = (path: string, a: unknown, b: unknown) => {
        const ka = keys(a), kb = keys(b);
        const added = ka.filter(k => !kb.includes(k)), removed = kb.filter(k => !ka.includes(k));
        console.log(`keys ${path}: ${added.length || removed.length ? `added ${JSON.stringify(added)} removed ${JSON.stringify(removed)}` : "same as fixture"}`);
    };
    diff("(top)", live, fixture);
    diff("encounters", live.encounters, fixture.encounters);
    diff("profile", live.profile, fixture.profile);
    diff("customImages", live.customImages, fixture.customImages);
    diff("savage[0]", live.encounters?.savage?.[0], fixture.encounters?.savage?.[0]);
    diff("ultimate[0]", live.encounters?.ultimate?.[0], fixture.encounters?.ultimate?.[0]);

    const res = await requestTomestone(token, lodestoneId);
    console.log("\nparse status:", res.status);
    if (res.status !== "ok") return;

    const c = res.data.character;
    console.log("character fields present:", {
        name: !!c.name, world: !!c.world, dataCenter: !!c.dataCenter, title: !!c.title, freeCompany: !!c.freeCompany,
        activeJob: !!c.activeJob, itemLevel: !!c.itemLevel, avatar: !!c.avatarUrl, portrait: !!c.lodestonePortraitUrl,
        customPortrait: !!c.customArt.portrait, customBanner: !!c.customArt.banner, customAvatar: !!c.customArt.avatar,
        jobs: c.jobs.length,
    });
    const got = Object.keys(res.data.encounters);
    console.log(`encounters: ${got.length} parsed, missing from constants: ${JSON.stringify(expectedNames.filter(n => !got.includes(n)))}`);
    console.log("extra canonical names not in constants:", got.filter(n => !expectedNames.includes(n)));
    console.log("active progression:", { savage: !!res.data.activeProgression.savage, ultimate: !!res.data.activeProgression.ultimate });
}

(async () => {
    console.log(`Character: ${env.FFXIV_LODESTONE_ID ? "from -LodestoneId" : "from tomestone-profile.json"}`);
    await checkFflogs();
    await checkTomestone();
})().catch(e => {
    console.error("check failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
});
