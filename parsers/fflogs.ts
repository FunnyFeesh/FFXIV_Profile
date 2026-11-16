/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CURRENT_SAVAGE_TIER, EncounterDef, SAVAGE_TIERS, ULTIMATES } from "../constants";
import type { FetchResult, FflogsData, FflogsEncounterData, FflogsMetric, SavageTierKey } from "../types";

export type { FflogsMetric };
export const FFLOGS_METRICS: readonly FflogsMetric[] = ["rdps", "adps", "cdps"];

// "core" = pinned savage tier (Savage + Normal) + all ultimates (~26 points). A tier key = that tier only (~10 points),
// fetched when it's picked in the modal's tier dropdown.
export type FflogsScope = "core" | SavageTierKey;

export function isFflogsScope(s: unknown): s is FflogsScope {
    return s === "core" || (typeof s === "string" && Object.hasOwn(SAVAGE_TIERS, s));
}

// Best % and kills are all-time: every zone asks for all partitions. Omitting `partition` gives the same
// result today (checked live), but being explicit keeps it all-time if FFLogs changes its default.
const ALL_PARTITIONS = -1;

// Savage and Normal share encounter IDs. Without `difficulty`, FFLogs answers with Normal rankings for someone
// who has no Savage logs, and those showed up as Savage parses. Savage zones ask for each difficulty explicitly.
export const SAVAGE_DIFFICULTY = 101;
export const NORMAL_DIFFICULTY = 100;

interface ZoneDefs {
    zoneId: number;
    encounters: EncounterDef[];
    savage: boolean;
}

function zoneDefs(scope: FflogsScope): ZoneDefs[] {
    const zones = new Map<number, ZoneDefs>();
    const add = (zoneId: number, e: EncounterDef, savage: boolean) => {
        if (!zones.has(zoneId)) zones.set(zoneId, { zoneId, encounters: [], savage });
        zones.get(zoneId)!.encounters.push(e);
    };
    const tier = SAVAGE_TIERS[scope === "core" ? CURRENT_SAVAGE_TIER : scope];
    for (const f of tier.floors) add(tier.fflogsZoneId, f, true);
    if (scope === "core")
        for (const u of Object.values(ULTIMATES)) add(u.fflogsZoneId, u, false);
    return [...zones.values()];
}

// The metric is inlined rather than passed as a variable so the query doesn't depend on the enum type's name
export function buildFflogsQuery(metric: FflogsMetric, scope: FflogsScope) {
    if (!FFLOGS_METRICS.includes(metric)) throw new Error("Invalid metric");
    if (!isFflogsScope(scope)) throw new Error("Invalid scope");

    const rankings = (alias: string, zoneId: number, difficulty?: number) =>
        `${alias}: zoneRankings(zoneID: ${zoneId}${difficulty ? `, difficulty: ${difficulty}` : ""}, metric: ${metric}, partition: ${ALL_PARTITIONS})`;
    // Ultimates have a single difficulty
    const zones = zoneDefs(scope)
        .flatMap(z => z.savage
            ? [rankings(`z${z.zoneId}`, z.zoneId, SAVAGE_DIFFICULTY), rankings(`z${z.zoneId}n`, z.zoneId, NORMAL_DIFFICULTY)]
            : [rankings(`z${z.zoneId}`, z.zoneId)])
        .join("\n            ");

    return `query ($id: Int!) {
    rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
    characterData {
        character(lodestoneID: $id) {
            hidden
            ${zones}
        }
    }
}`;
}

interface FlRanking {
    encounter?: { id?: number; name?: string; } | null;
    rankPercent?: number | null;
    totalKills?: number | null;
    fastestKill?: number | null;
    bestSpec?: string | null;
    spec?: string | null;
}

interface FlZone {
    difficulty?: number | null;
    rankings?: FlRanking[];
}

interface FlResponse {
    errors?: Array<{ message?: string; }>;
    data?: {
        rateLimitData?: FflogsData["rateLimit"];
        characterData?: {
            character?: ({ hidden?: boolean; } & Record<string, unknown>) | null;
        } | null;
    } | null;
}

export function parseFflogsResponse(json: unknown, scope: FflogsScope): FetchResult<FflogsData> {
    const res = json as FlResponse;
    const character = res?.data?.characterData?.character;

    if (character === null) return { status: "not_found" };
    if (!character) {
        const message = res?.errors?.map(e => e.message).join("; ") || "Unexpected FFLogs response";
        return { status: "error", message };
    }
    if (character.hidden) return { status: "private" };

    const encounters: Record<string, FflogsEncounterData> = {};
    const normalEncounters: Record<string, FflogsEncounterData> = {};

    const read = (zone: ZoneDefs, alias: string, difficulty: number | undefined, into: Record<string, FflogsEncounterData>) => {
        const z = character[alias] as FlZone | null | undefined;
        // Never let one difficulty's rankings stand in for another's
        if (!z || (difficulty && z.difficulty != null && z.difficulty !== difficulty)) return;
        for (const r of z.rankings ?? []) {
            const def = zone.encounters.find(d => d.fflogsEncounterId === r.encounter?.id);
            if (!def) continue;
            into[def.canonicalName] = {
                killCount: r.totalKills ?? 0,
                bestPercent: r.rankPercent ?? null,
                bestJob: r.bestSpec ?? r.spec ?? null,
                fastestKillMs: r.fastestKill || null,
            };
        }
    };

    for (const zone of zoneDefs(scope)) {
        if (zone.savage) {
            read(zone, `z${zone.zoneId}`, SAVAGE_DIFFICULTY, encounters);
            read(zone, `z${zone.zoneId}n`, NORMAL_DIFFICULTY, normalEncounters);
        } else {
            read(zone, `z${zone.zoneId}`, undefined, encounters);
        }
    }

    return { status: "ok", data: { encounters, normalEncounters, rateLimit: res.data?.rateLimitData ?? null } };
}
