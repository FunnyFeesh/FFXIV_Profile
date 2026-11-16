/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// HTTP layer with no Electron imports, so dev/checkLive.ts can run it under plain Node.
// native.ts wraps these with the stored secrets.

import { buildFflogsQuery, FflogsMetric, FflogsScope, parseFflogsResponse } from "./parsers/fflogs";
import { findExactMatches, parseLodestoneBio, parseLodestonePageCount, parseLodestoneProfile, parseLodestoneSearch } from "./parsers/lodestone";
import { parseTomestoneProfile } from "./parsers/tomestone";
import { findDataCenter, findWorld } from "./services/worlds";
import type { CharacterInfo, FetchResult, FflogsData, LodestoneMatches, LodestoneSearchResult, LodestoneSearchScope, TomestoneData } from "./types";

const TIMEOUT_MS = 15_000;

export function isLodestoneId(id: unknown): id is string {
    return typeof id === "string" && /^\d{1,12}$/.test(id);
}

const invalidId = { status: "error", message: "Invalid Lodestone ID" } as const;

// Network errors carry no request headers, so this can't leak a token
function networkError(e: unknown) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) } as const;
}

// --- FFLogs ---

export interface FflogsCredentials {
    clientId: string;
    clientSecret: string;
}

let fflogsToken: { token: string; expiresAt: number; } | null = null;

export function clearFflogsToken() {
    fflogsToken = null;
}

async function getFflogsToken({ clientId, clientSecret }: FflogsCredentials): Promise<FetchResult<string>> {
    if (fflogsToken && Date.now() < fflogsToken.expiresAt) return { status: "ok", data: fflogsToken.token };

    const res = await fetch("https://www.fflogs.com/oauth/token", {
        method: "POST",
        headers: {
            "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 400 || res.status === 401) return { status: "bad_token", message: "FFLogs rejected the client ID or secret" };
    if (!res.ok) return { status: "error", message: `FFLogs auth failed (HTTP ${res.status})` };

    const body = await res.json() as { access_token: string; expires_in: number; };
    // Renew a minute early
    fflogsToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return { status: "ok", data: fflogsToken.token };
}

// Raw GraphQL call; returns the parsed JSON body
export async function fflogsQuery(creds: FflogsCredentials, query: string, variables: object = {}): Promise<FetchResult<unknown>> {
    try {
        // Retry once with a fresh token if the cached one was revoked
        for (let attempt = 0; attempt < 2; attempt++) {
            const token = await getFflogsToken(creds);
            if (token.status !== "ok") return token;

            const res = await fetch("https://www.fflogs.com/api/v2/client", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token.data}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query, variables }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });

            if (res.status === 401 && attempt === 0) {
                clearFflogsToken();
                continue;
            }
            if (res.status === 429) return { status: "error", message: "FFLogs hourly rate limit reached" };
            if (!res.ok) return { status: "error", message: `FFLogs request failed (HTTP ${res.status})` };

            return { status: "ok", data: await res.json() };
        }
        return { status: "bad_token", message: "FFLogs rejected the access token" };
    } catch (e) {
        return networkError(e);
    }
}

export async function requestFflogs(creds: FflogsCredentials, lodestoneId: string, metric: FflogsMetric, scope: FflogsScope): Promise<FetchResult<FflogsData>> {
    if (!isLodestoneId(lodestoneId)) return invalidId;
    let query: string;
    try {
        query = buildFflogsQuery(metric, scope);
    } catch (e) {
        return networkError(e);
    }
    const res = await fflogsQuery(creds, query, { id: Number(lodestoneId) });
    return res.status === "ok" ? parseFflogsResponse(res.data, scope) : res;
}

// --- Tomestone ---
// Raw profile call; returns the parsed JSON body
export async function tomestoneProfileJson(token: string, lodestoneId: string): Promise<FetchResult<unknown>> {
    if (!isLodestoneId(lodestoneId)) return invalidId;
    try {
        const res = await fetch(`https://tomestone.gg/api/character/profile/${lodestoneId}`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json",
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        switch (res.status) {
            case 401: return { status: "bad_token", message: "Tomestone rejected the API token" };
            case 403: return { status: "private" };
            case 404: return { status: "not_found" };
            case 503: return { status: "error", message: "Tomestone is temporarily unavailable" };
        }
        if (!res.ok) return { status: "error", message: `Tomestone request failed (HTTP ${res.status})` };

        return { status: "ok", data: await res.json() };
    } catch (e) {
        return networkError(e);
    }
}

export async function requestTomestone(token: string, lodestoneId: string): Promise<FetchResult<TomestoneData>> {
    const res = await tomestoneProfileJson(token, lodestoneId);
    return res.status === "ok" ? parseTomestoneProfile(res.data) : res;
}

// --- Lodestone (fallback when Tomestone is unavailable) ---

const LODESTONE = "https://na.finalfantasyxiv.com/lodestone";

export async function requestLodestone(lodestoneId: string): Promise<FetchResult<CharacterInfo>> {
    if (!isLodestoneId(lodestoneId)) return invalidId;
    try {
        const res = await fetch(`${LODESTONE}/character/${lodestoneId}/`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status === 404) return { status: "not_found" };
        if (!res.ok) return { status: "error", message: `Lodestone request failed (HTTP ${res.status})` };

        const character = parseLodestoneProfile(await res.text());
        return character
            ? { status: "ok", data: character }
            : { status: "error", message: "Couldn't read the Lodestone page" };
    } catch (e) {
        return networkError(e);
    }
}

// Substring search returns 50 per page in no useful order, so an exact match can be on any page.
// Three pages bounds the cost of a common name; past that, uniqueness is reported as unproven.
const MAX_SEARCH_PAGES = 3;

// Every character whose name is exactly `name`, within one world, one data center (`_dc_<DC>`, checked live)
// or all worlds. Worlds and DCs must be on the world list.
export async function searchLodestoneExact(name: string, scope: LodestoneSearchScope): Promise<FetchResult<LodestoneMatches>> {
    if (typeof name !== "string" || !name.trim()) return { status: "error", message: "Enter a character name" };
    const world = "world" in scope ? findWorld(scope.world) ?? undefined : undefined;
    const dataCenter = "dataCenter" in scope ? findDataCenter(scope.dataCenter) : null;
    if (("world" in scope && !world) || ("dataCenter" in scope && !dataCenter))
        return { status: "error", message: "Unknown world or data center" };
    const worldname = world ?? (dataCenter ? `_dc_${dataCenter}` : "");

    try {
        const matches: LodestoneSearchResult[] = [];
        let pages = 1;
        for (let page = 1; page <= Math.min(pages, MAX_SEARCH_PAGES); page++) {
            const params = new URLSearchParams({ q: name.trim() });
            if (worldname) params.set("worldname", worldname);
            if (page > 1) params.set("page", String(page));

            const res = await fetch(`${LODESTONE}/character/?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (!res.ok) return { status: "error", message: `Lodestone search failed (HTTP ${res.status})` };

            const html = await res.text();
            if (page === 1) pages = parseLodestonePageCount(html);
            matches.push(...findExactMatches(parseLodestoneSearch(html), name, world));
            // Within one world a full name is unique, so the first hit settles it
            if (world && matches.length) break;
        }
        return { status: "ok", data: { matches, complete: pages <= MAX_SEARCH_PAGES || (!!world && matches.length > 0) } };
    } catch (e) {
        return networkError(e);
    }
}

export async function searchLodestone(name: string, world: string): Promise<FetchResult<LodestoneSearchResult>> {
    if (typeof name !== "string" || typeof world !== "string" || !name.trim() || !world.trim())
        return { status: "error", message: "Enter a character name and world" };
    const res = await searchLodestoneExact(name, { world });
    if (res.status !== "ok") return res;
    const match = res.data.matches[0];
    return match ? { status: "ok", data: match } : { status: "not_found" };
}

// The character's Lodestone "Character Profile" text, used to confirm a guess that names the Discord user's ID
export async function requestLodestoneBio(lodestoneId: string): Promise<FetchResult<string>> {
    if (!isLodestoneId(lodestoneId)) return invalidId;
    try {
        const res = await fetch(`${LODESTONE}/character/${lodestoneId}/`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status === 404) return { status: "not_found" };
        if (!res.ok) return { status: "error", message: `Lodestone request failed (HTTP ${res.status})` };
        return { status: "ok", data: parseLodestoneBio(await res.text()) };
    } catch (e) {
        return networkError(e);
    }
}
