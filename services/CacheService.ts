/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import { DATA_KEYS } from "../constants";
import type { RaiderPassport } from "../types";

// DataStore (IndexedDB) persists across restarts; the Map gives badges a synchronous read
const memory = new Map<string, RaiderPassport>();
let credentialsChangedAt = 0;

// Loads every cached passport into memory so badges can render synchronously after a restart
export async function loadCache() {
    credentialsChangedAt = await DataStore.get<number>(DATA_KEYS.credentialsChangedAt) ?? 0;

    const prefix = DATA_KEYS.cache("");
    const keys = (await DataStore.keys()).filter((k): k is string => typeof k === "string" && k.startsWith(prefix));
    const passports = await DataStore.getMany<RaiderPassport>(keys);
    for (const p of passports) if (p) memory.set(p.lodestoneId, p);
}

export function getCredentialsChangedAt() {
    return credentialsChangedAt;
}

// New or changed credentials make every cached passport stale, so "No Token" results don't linger
export async function markCredentialsChanged() {
    credentialsChangedAt = Date.now();
    await DataStore.set(DATA_KEYS.credentialsChangedAt, credentialsChangedAt);
}

export function getCachedSync(lodestoneId: string) {
    return memory.get(lodestoneId) ?? null;
}

export async function getCached(lodestoneId: string) {
    const hit = memory.get(lodestoneId);
    if (hit) return hit;
    const stored = await DataStore.get<RaiderPassport>(DATA_KEYS.cache(lodestoneId));
    if (stored) memory.set(lodestoneId, stored);
    return stored ?? null;
}

export async function saveCached(p: RaiderPassport) {
    memory.set(p.lodestoneId, p);
    await DataStore.set(DATA_KEYS.cache(p.lodestoneId), p);
}
