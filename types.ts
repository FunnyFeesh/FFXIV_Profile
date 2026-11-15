/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type SecretKind = "fflogsClientId" | "fflogsClientSecret" | "tomestoneToken";

export type SourceName = "fflogs" | "tomestone" | "lodestone";

export type FflogsMetric = "rdps" | "adps" | "cdps";

// "skipped" = not requested this fetch (e.g. Lodestone when Tomestone succeeded)
export type SourceStatus = "ok" | "no_token" | "bad_token" | "private" | "not_found" | "error" | "skipped";

export type FetchResult<T> =
    | { status: "ok"; data: T; }
    | { status: Exclude<SourceStatus, "ok" | "skipped">; message?: string; };

export type IdentitySource = "local_override" | "discord_note" | "discord_bio";

export interface CharacterLink {
    lodestoneId: string;
    name?: string;
    world?: string;
}

// characters[0] is the primary character, the rest are alts
export interface LinkRecord {
    characters: CharacterLink[];
}

// Stored under DATA_KEYS.links, keyed by Discord user ID
export type LinkMap = Record<string, LinkRecord>;

export interface ResolvedCharacterIdentity extends CharacterLink {
    source: IdentitySource;
}

// Synchronous so badges can use it; name + world lookups are cached and resolved in the background
export interface IdentityProvider {
    id: IdentitySource;
    resolve(discordUserId: string): ResolvedCharacterIdentity | null;
}

export type SavageTierKey = "heavyweight" | "cruiserweight" | "lightHeavyweight";

export type UltimateKey = "ucob" | "uwu" | "tea" | "dsr" | "top" | "fru" | "dmu";

export interface EncounterProgOrParse {
    // Tomestone canonicalName, also our join key between sources
    canonicalName: string;
    shortName: string;
    fullName: string;
    cleared: boolean;
    // null = unknown (FFLogs unavailable), not zero
    killCount: number | null;
    bestPercent: number | null;
    bestJob: string | null;
    fastestKillMs: number | null;
    // Tomestone prog label, e.g. "72.48% P2"
    progPoint: string | null;
    progMechanic: string | null;
    // Remaining boss HP %, for progress bars
    progPercent: number | null;
    progPrivate: boolean;
    // Tomestone duty banner (assets.tomestone.gg), used as the tile background
    bannerUrl: string | null;
}

export interface ActiveProgression {
    name: string;
    percent: string | null;
    mechanic: string | null;
    private: boolean;
    updatedAt: number | null;
}

export interface ArtImage {
    url: string;
    // CSS background-position crop hint from Tomestone
    position?: string;
}

export type JobRole = "tanks" | "healers" | "melee" | "ranged" | "casters" | "other";

export interface JobLevel {
    // ClassJob ID (Tomestone only); icon = XIVAPI ui/icon/062000/0621<id>
    id?: number;
    role: JobRole;
    name: string;
    slug: string;
    level: number;
}

export interface CharacterInfo {
    name: string;
    world: string;
    dataCenter: string;
    title?: string;
    freeCompany?: string;
    activeJob?: string;
    activeJobId?: number;
    activeJobLevel?: number;
    itemLevel?: number;
    // Lodestone images (img2.finalfantasyxiv.com)
    avatarUrl?: string;
    lodestonePortraitUrl?: string;
    // Tomestone custom art (assets.tomestone.gg), preferred over Lodestone images
    customArt: {
        portrait?: ArtImage;
        banner?: ArtImage;
        avatar?: ArtImage;
    };
    jobs: JobLevel[];
}

// Per-source results from native.ts, keyed by Tomestone canonicalName

export interface TomestoneEncounterData {
    bannerUrl: string | null;
    cleared: boolean;
    progPoint: string | null;
    progMechanic: string | null;
    progPercent: number | null;
    progPrivate: boolean;
}

export interface TomestoneData {
    character: CharacterInfo;
    encounters: Record<string, TomestoneEncounterData>;
    activeProgression: RaiderPassport["activeProgression"];
}

export interface FflogsEncounterData {
    killCount: number;
    bestPercent: number | null;
    bestJob: string | null;
    fastestKillMs: number | null;
}

export interface FflogsData {
    encounters: Record<string, FflogsEncounterData>;
    rateLimit: { limitPerHour: number; pointsSpentThisHour: number; pointsResetIn: number; } | null;
}

export interface LodestoneSearchResult {
    lodestoneId: string;
    name: string;
    world: string;
    dataCenter: string;
}

export interface RaiderPassport {
    lodestoneId: string;
    fetchedAt: number;
    metric: FflogsMetric;
    // sources.fflogs covers the pinned tier and ultimates
    sources: Record<SourceName, SourceStatus>;
    // FFLogs status per savage tier; older tiers stay "skipped" until picked in the modal
    tierFflogs: Record<SavageTierKey, SourceStatus>;
    character: CharacterInfo | null;
    savageTiers: Record<SavageTierKey, EncounterProgOrParse[]>;
    ultimates: Record<UltimateKey, EncounterProgOrParse>;
    activeProgression: {
        savage: ActiveProgression | null;
        ultimate: ActiveProgression | null;
    };
}
