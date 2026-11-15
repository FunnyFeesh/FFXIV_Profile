/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CURRENT_SAVAGE_TIER } from "../constants";
import { settings } from "../settings";
import type { FflogsMetric, RaiderPassport, SavageTierKey } from "../types";
import { getCached, getCachedSync, getCredentialsChangedAt, saveCached } from "./CacheService";
import { emitChange } from "./events";
import { Native, safeFetch } from "./ipc";
import { applyTierFflogs, buildPassport, FreshnessContext, RefreshDecision, refreshDecision } from "./passportModel";

const inflight = new Map<string, Promise<RaiderPassport>>();
const tierInflight = new Map<string, Promise<void>>();

function freshnessContext(): FreshnessContext {
    return {
        now: Date.now(),
        ttlMs: settings.store.cacheTtlHours * 3_600_000,
        metric: settings.store.parseMetric as FflogsMetric,
        credentialsChangedAt: getCredentialsChangedAt(),
    };
}

export interface PassportState {
    passport: RaiderPassport | null;
    loading: boolean;
}

export function getPassportStateSync(lodestoneId: string): PassportState {
    return { passport: getCachedSync(lodestoneId), loading: inflight.has(lodestoneId) };
}

async function fetchPassport(lodestoneId: string): Promise<RaiderPassport> {
    const metric = settings.store.parseMetric as FflogsMetric;
    const [fflogs, tomestone] = await Promise.all([
        safeFetch(() => Native.fetchFflogs(lodestoneId, metric, "core")),
        safeFetch(() => Native.fetchTomestone(lodestoneId)),
    ]);
    // Lodestone is only the fallback for identity and art
    const lodestone = tomestone.status === "ok" ? null : await safeFetch(() => Native.fetchLodestone(lodestoneId));

    const passport = buildPassport(lodestoneId, metric, Date.now(), { fflogs, tomestone, lodestone });
    await saveCached(passport);
    return passport;
}

// Loads the passport if needed. Called on popout/modal open (force = false) and by the
// Refresh button (Shift-click = force). Concurrent calls share one fetch.
export async function ensurePassport(lodestoneId: string, force = false): Promise<RefreshDecision> {
    const running = inflight.get(lodestoneId);
    if (running) {
        await running;
        return "fetch";
    }

    const wasInMemory = getCachedSync(lodestoneId) !== null;
    const cached = await getCached(lodestoneId);
    const decision = refreshDecision(cached, freshnessContext(), force);
    if (decision !== "fetch") {
        // A passport just read from DataStore is now visible to sync readers
        if (!wasInMemory && cached) emitChange();
        return decision;
    }

    const pending = fetchPassport(lodestoneId);
    inflight.set(lodestoneId, pending);
    emitChange();
    try {
        await pending;
    } finally {
        inflight.delete(lodestoneId);
        emitChange();
    }
    return "fetch";
}

export function isTierLoading(lodestoneId: string, tier: SavageTierKey) {
    return tierInflight.has(`${lodestoneId}:${tier}`);
}

// Fetches an older tier's FFLogs data when it's picked in the modal (~5 FFLogs points)
export async function loadTier(lodestoneId: string, tier: SavageTierKey) {
    const cached = getCachedSync(lodestoneId);
    if (!cached || tier === CURRENT_SAVAGE_TIER) return;
    const status = cached.tierFflogs[tier];
    if (status !== "skipped" && status !== "error") return;

    const key = `${lodestoneId}:${tier}`;
    if (tierInflight.has(key)) return tierInflight.get(key);

    const pending = (async () => {
        const result = await safeFetch(() => Native.fetchFflogs(lodestoneId, cached.metric, tier));
        // Apply to the latest copy in case the passport was refetched meanwhile
        const latest = getCachedSync(lodestoneId) ?? cached;
        await saveCached(applyTierFflogs(latest, tier, result));
    })();

    tierInflight.set(key, pending);
    emitChange();
    try {
        await pending;
    } finally {
        tierInflight.delete(key);
        emitChange();
    }
}
