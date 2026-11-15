/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CURRENT_SAVAGE_TIER, EncounterDef, SAVAGE_TIERS, ULTIMATES } from "../constants";
import type { FetchResult, FflogsData, FflogsEncounterData, FflogsMetric, SavageTierKey } from "../types";

export type { FflogsMetric };
export const FFLOGS_METRICS: readonly FflogsMetric[] = ["rdps", "adps", "cdps"];

// "core" = pinned savage tier + all ultimates (~21 points). A tier key = that tier only (~5 points),
// fetched when it's picked in the modal's tier dropdown.
export type FflogsScope = "core" | SavageTierKey;

export function isFflogsScope(s: unknown): s is FflogsScope {
    return s === "core" || (typeof s === "string" && Object.hasOwn(SAVAGE_TIERS, s));
}

// FFLogs' "all partitions" value
const ALL_PARTITIONS = -1;

interface ZoneDefs {
    zoneId: number;
    encounters: EncounterDef[];
    // Older savage tiers use all partitions so past-patch kills still count;
    // the pinned tier and ultimates use FFLogs' default (current) partition
    allPartitions: boolean;
}

function zoneDefs(scope: FflogsScope): ZoneDefs[] {
    const zones = new Map<number, ZoneDefs>();
    const add = (zoneId: number, e: EncounterDef, allPartitions: boolean) => {
        if (!zones.has(zoneId)) zones.set(zoneId, { zoneId, encounters: [], allPartitions });
        zones.get(zoneId)!.encounters.push(e);
    };
    const wantedTier = scope === "core" ? CURRENT_SAVAGE_TIER : scope;
    const tier = SAVAGE_TIERS[wantedTier];
    for (const f of tier.floors) add(tier.fflogsZoneId, f, wantedTier !== CURRENT_SAVAGE_TIER);
    if (scope === "core")
        for (const u of Object.values(ULTIMATES)) add(u.fflogsZoneId, u, false);
    return [...zones.values()];
}

// The metric is inlined rather than passed as a variable so the query doesn't depend on the enum type's name
export function buildFflogsQuery(metric: FflogsMetric, scope: FflogsScope) {
    if (!FFLOGS_METRICS.includes(metric)) throw new Error("Invalid metric");
    if (!isFflogsScope(scope)) throw new Error("Invalid scope");

    const zones = zoneDefs(scope)
        .map(z => {
            const partition = z.allPartitions ? `, partition: ${ALL_PARTITIONS}` : "";
            return `z${z.zoneId}: zoneRankings(zoneID: ${z.zoneId}, metric: ${metric}${partition})`;
        })
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
    for (const zone of zoneDefs(scope)) {
        const rankings = (character[`z${zone.zoneId}`] as { rankings?: FlRanking[]; } | null)?.rankings ?? [];
        for (const r of rankings) {
            const def = zone.encounters.find(d => d.fflogsEncounterId === r.encounter?.id);
            if (!def) continue;
            encounters[def.canonicalName] = {
                killCount: r.totalKills ?? 0,
                bestPercent: r.rankPercent ?? null,
                bestJob: r.bestSpec ?? r.spec ?? null,
                fastestKillMs: r.fastestKill || null,
            };
        }
    }

    return { status: "ok", data: { encounters, rateLimit: res.data?.rateLimitData ?? null } };
}
