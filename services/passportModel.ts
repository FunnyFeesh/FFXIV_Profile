/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Pure merge and freshness rules, kept free of Vencord imports so they can be unit-tested

import { CURRENT_SAVAGE_TIER, EncounterDef, REFRESH_COOLDOWN_MS, SAVAGE_TIERS, ULTIMATES } from "../constants";
import type {
    CharacterInfo, EncounterProgOrParse, FetchResult, FflogsData, FflogsMetric, RaiderPassport,
    SavageTierKey, SourceStatus, TomestoneData, UltimateKey,
} from "../types";

export interface SourceResults {
    fflogs: FetchResult<FflogsData>;
    tomestone: FetchResult<TomestoneData>;
    // null = not requested (Tomestone answered)
    lodestone: FetchResult<CharacterInfo> | null;
}

const statusOf = (r: FetchResult<unknown> | null): SourceStatus => r?.status ?? "skipped";

// Bumped when cached passports must be rebuilt: 2 = Savage and Normal FFLogs rankings kept apart,
// 3 = duty art for fights Tomestone sent none for
export const PASSPORT_SCHEMA = 3;

export const dutyArtUrl = (art: number) => `https://assets.tomestone.gg/i/112000/${art}.webp`;

function normalOf(fflogs: FetchResult<FflogsData> | null, canonicalName: string): EncounterProgOrParse["normal"] {
    const n = fflogs?.status === "ok" ? fflogs.data.normalEncounters?.[canonicalName] : undefined;
    return n?.killCount ? { killCount: n.killCount, bestPercent: n.bestPercent } : null;
}

function toEntry(def: EncounterDef, fflogs: FetchResult<FflogsData> | null, tomestone: TomestoneData | null): EncounterProgOrParse {
    const ffOk = fflogs?.status === "ok";
    const ff = ffOk ? fflogs.data.encounters[def.canonicalName] : undefined;
    const ts = tomestone?.encounters[def.canonicalName];
    return {
        canonicalName: def.canonicalName,
        shortName: def.shortName,
        fullName: def.fullName,
        // Either source counts: Tomestone knows clears from achievements even without an FFLogs log
        cleared: (ff?.killCount ?? 0) > 0 || !!ts?.cleared,
        killCount: ffOk ? ff?.killCount ?? 0 : null,
        bestPercent: ff?.bestPercent ?? null,
        bestJob: ff?.bestJob ?? null,
        fastestKillMs: ff?.fastestKillMs ?? null,
        progPoint: ts?.progPoint ?? null,
        progMechanic: ts?.progMechanic ?? null,
        progPercent: ts?.progPercent ?? null,
        progPrivate: ts?.progPrivate ?? false,
        // Tomestone only sends art for fights the character has touched
        bannerUrl: ts?.bannerUrl ?? dutyArtUrl(def.art),
        normal: normalOf(fflogs, def.canonicalName),
    };
}

function mapRecord<K extends string, V, R>(rec: Record<K, V>, fn: (v: V, k: K) => R): Record<K, R> {
    return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, fn(v as V, k as K)])) as Record<K, R>;
}

export function buildPassport(lodestoneId: string, metric: FflogsMetric, fetchedAt: number, res: SourceResults): RaiderPassport {
    const ts = res.tomestone.status === "ok" ? res.tomestone.data : null;
    const lodestone = res.lodestone?.status === "ok" ? res.lodestone.data : null;

    return {
        schema: PASSPORT_SCHEMA,
        lodestoneId,
        fetchedAt,
        metric,
        sources: {
            fflogs: res.fflogs.status,
            tomestone: res.tomestone.status,
            lodestone: statusOf(res.lodestone),
        },
        tierFflogs: mapRecord(SAVAGE_TIERS, (_, key) => key === CURRENT_SAVAGE_TIER ? res.fflogs.status : "skipped"),
        character: ts?.character ?? lodestone,
        savageTiers: mapRecord(SAVAGE_TIERS, (tier, key) =>
            tier.floors.map(f => toEntry(f, key === CURRENT_SAVAGE_TIER ? res.fflogs : null, ts))),
        ultimates: mapRecord(ULTIMATES, u => toEntry(u, res.fflogs, ts)) as Record<UltimateKey, EncounterProgOrParse>,
        activeProgression: ts?.activeProgression ?? { savage: null, ultimate: null },
    };
}

// Overlays an older tier's FFLogs result (fetched on demand) onto a passport
export function applyTierFflogs(p: RaiderPassport, tier: SavageTierKey, result: FetchResult<FflogsData>): RaiderPassport {
    const ok = result.status === "ok";
    const entries = p.savageTiers[tier].map(e => {
        const ff = ok ? result.data.encounters[e.canonicalName] : undefined;
        return {
            ...e,
            cleared: e.cleared || (ff?.killCount ?? 0) > 0,
            killCount: ok ? ff?.killCount ?? 0 : null,
            bestPercent: ff?.bestPercent ?? null,
            bestJob: ff?.bestJob ?? null,
            fastestKillMs: ff?.fastestKillMs ?? null,
            normal: normalOf(result, e.canonicalName),
        };
    });
    return {
        ...p,
        savageTiers: { ...p.savageTiers, [tier]: entries },
        tierFflogs: { ...p.tierFflogs, [tier]: result.status },
    };
}

export interface FreshnessContext {
    now: number;
    ttlMs: number;
    metric: FflogsMetric;
    credentialsChangedAt: number;
}

export function isFresh(p: RaiderPassport, ctx: FreshnessContext) {
    if (p.schema !== PASSPORT_SCHEMA) return false;
    if (p.metric !== ctx.metric) return false;
    if (p.fetchedAt <= ctx.credentialsChangedAt) return false;
    if (ctx.now - p.fetchedAt >= ctx.ttlMs) return false;
    // Transient failures shouldn't be kept for the whole TTL
    return !Object.values(p.sources).includes("error");
}

export type RefreshDecision = "fetch" | "fresh" | "cooldown";

// Normal open/click: fetch only when stale. Shift-click (force): fetch even when fresh.
// Both wait out the cooldown since the last fetch.
export function refreshDecision(p: RaiderPassport | null, ctx: FreshnessContext, force: boolean): RefreshDecision {
    if (!p) return "fetch";
    if (ctx.now - p.fetchedAt < REFRESH_COOLDOWN_MS) return "cooldown";
    if (!force && isFresh(p, ctx)) return "fresh";
    return "fetch";
}
