/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Answers: does zoneRankings without a `partition` argument mean "latest partition" or "all partitions"?
// Run via dev/check-live.ps1 -Partitions. Prints only which result sets match each other (~25 FFLogs points).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fflogsQuery } from "../api";

const { env } = process;
const fixture = JSON.parse(readFileSync(join(process.cwd(), "..", "tomestone-profile.json"), "utf8").replace(/^﻿/, ""));
const lodestoneId = Number(env.FFXIV_LODESTONE_ID || fixture.id);

const ZONES = [73, 59];

async function rankingsSignature(creds: { clientId: string; clientSecret: string; }, zone: number, partition?: number) {
    const arg = partition == null ? "" : `, partition: ${partition}`;
    const q = `query ($id: Int!) { characterData { character(lodestoneID: $id) { zoneRankings(zoneID: ${zone}, metric: rdps${arg}) } } }`;
    const res = await fflogsQuery(creds, q, { id: lodestoneId });
    if (res.status !== "ok") return `error: ${res.status}`;
    const zr = (res.data as any).data?.characterData?.character?.zoneRankings;
    const rankings: any[] = zr?.rankings ?? [];
    // Kills + floored percentile per encounter; compared, never printed
    return rankings.map(r => `${r.encounter?.id}:${r.totalKills}:${r.rankPercent == null ? "-" : Math.floor(r.rankPercent)}`).join(" ");
}

(async () => {
    const clientId = env.FFXIV_FFLOGS_ID, clientSecret = env.FFXIV_FFLOGS_SECRET;
    if (!clientId || !clientSecret) return console.log("FFLogs credentials required");
    const creds = { clientId, clientSecret };

    for (const zone of ZONES) {
        const wd = await fflogsQuery(creds, `{ worldData { zone(id: ${zone}) { name partitions { id compactName default } } } }`);
        if (wd.status !== "ok") { console.log(`zone ${zone}: worldData ${wd.status}`); continue; }
        const z = (wd.data as any).data.worldData.zone;
        const defaults: number[] = z.partitions.filter((p: any) => p.default).map((p: any) => p.id);

        const noArg = await rankingsSignature(creds, zone);
        const all = await rankingsSignature(creds, zone, -1);
        console.log(`\nzone ${zone} (${z.name}): default partitions ${JSON.stringify(defaults)}`);
        console.log(`  no-arg == all partitions (-1): ${noArg === all}`);
        for (const id of defaults) {
            const sig = await rankingsSignature(creds, zone, id);
            const name = z.partitions.find((p: any) => p.id === id)?.compactName;
            console.log(`  no-arg == partition ${id} (${name}): ${noArg === sig}   | partition ${id} == all: ${sig === all}`);
        }
    }
    console.log("\nIf every comparison in a zone is true, this character has no kills outside the latest partition there, so that zone can't tell.");
})().catch(e => {
    console.error("check failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
});
