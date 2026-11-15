/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { JobRole, SavageTierKey, UltimateKey } from "./types";

export const DATA_KEYS = {
    links: "ffxivProfile:links",
    cache: (lodestoneId: string) => `ffxivProfile:cache:${lodestoneId}`,
    // Passports fetched before this time are stale (credentials were added or changed since)
    credentialsChangedAt: "ffxivProfile:credentialsChangedAt",
};

export const REFRESH_COOLDOWN_MS = 60_000;

export interface EncounterDef {
    canonicalName: string;
    shortName: string;
    fullName: string;
    // Verified against worldData.zone(id).encounters on 2026-11-14
    fflogsEncounterId: number;
}

export interface SavageTierDef {
    label: string;
    fflogsZoneId: number;
    // Tomestone encounterGroupCanonicalName
    tomestoneGroup: string;
    floors: EncounterDef[];
}

// Pinned in the popout. Not switched automatically when a new tier releases.
export const CURRENT_SAVAGE_TIER: SavageTierKey = "heavyweight";

export const SAVAGE_TIERS: Record<SavageTierKey, SavageTierDef> = {
    heavyweight: {
        label: "AAC Heavyweight",
        fflogsZoneId: 73,
        tomestoneGroup: "aac-heavyweight-savage",
        floors: [
            { canonicalName: "vamp-fatale", shortName: "M9S", fullName: "Vamp Fatale", fflogsEncounterId: 101 },
            { canonicalName: "red-hot-deep-blue", shortName: "M10S", fullName: "Red Hot and Deep Blue", fflogsEncounterId: 102 },
            { canonicalName: "the-tyrant", shortName: "M11S", fullName: "The Tyrant", fflogsEncounterId: 103 },
            { canonicalName: "lindwurm", shortName: "M12S P1", fullName: "Lindwurm", fflogsEncounterId: 104 },
            { canonicalName: "lindwurm-ii", shortName: "M12S P2", fullName: "Lindwurm II", fflogsEncounterId: 105 },
        ],
    },
    cruiserweight: {
        label: "AAC Cruiserweight",
        fflogsZoneId: 68,
        tomestoneGroup: "aac-cruiserweight-savage",
        floors: [
            { canonicalName: "dancing-green", shortName: "M5S", fullName: "Dancing Green", fflogsEncounterId: 97 },
            { canonicalName: "sugar-riot", shortName: "M6S", fullName: "Sugar Riot", fflogsEncounterId: 98 },
            { canonicalName: "brute-abombinator", shortName: "M7S", fullName: "Brute Abombinator", fflogsEncounterId: 99 },
            { canonicalName: "howling-blade", shortName: "M8S", fullName: "Howling Blade", fflogsEncounterId: 100 },
        ],
    },
    lightHeavyweight: {
        label: "AAC Light-heavyweight",
        fflogsZoneId: 62,
        tomestoneGroup: "aac-light-heavyweight-savage",
        floors: [
            { canonicalName: "black-cat", shortName: "M1S", fullName: "Black Cat", fflogsEncounterId: 93 },
            { canonicalName: "honey-b.-lovely", shortName: "M2S", fullName: "Honey B. Lovely", fflogsEncounterId: 94 },
            { canonicalName: "brute-bomber", shortName: "M3S", fullName: "Brute Bomber", fflogsEncounterId: 95 },
            { canonicalName: "wicked-thunder", shortName: "M4S", fullName: "Wicked Thunder", fflogsEncounterId: 96 },
        ],
    },
};

export interface UltimateDef extends EncounterDef {
    fflogsZoneId: number;
}

export const ULTIMATES: Record<UltimateKey, UltimateDef> = {
    ucob: { canonicalName: "the-unending-coil-of-bahamut-ultimate", shortName: "UCOB", fullName: "The Unending Coil of Bahamut", fflogsZoneId: 59, fflogsEncounterId: 1073 },
    uwu: { canonicalName: "the-weapons-refrain-ultimate", shortName: "UWU", fullName: "The Weapon's Refrain", fflogsZoneId: 59, fflogsEncounterId: 1074 },
    tea: { canonicalName: "the-epic-of-alexander-ultimate", shortName: "TEA", fullName: "The Epic of Alexander", fflogsZoneId: 59, fflogsEncounterId: 1075 },
    dsr: { canonicalName: "dragonsongs-reprise-ultimate", shortName: "DSR", fullName: "Dragonsong's Reprise", fflogsZoneId: 59, fflogsEncounterId: 1076 },
    top: { canonicalName: "the-omega-protocol-ultimate", shortName: "TOP", fullName: "The Omega Protocol", fflogsZoneId: 59, fflogsEncounterId: 1077 },
    fru: { canonicalName: "futures-rewritten-ultimate", shortName: "FRU", fullName: "Futures Rewritten", fflogsZoneId: 65, fflogsEncounterId: 1079 },
    dmu: { canonicalName: "dancing-mad-ultimate", shortName: "DMU", fullName: "Dancing Mad", fflogsZoneId: 76, fflogsEncounterId: 1085 },
};

// FFLogs percentile tiers, highest first: [minPercent, color]
export const PARSE_COLORS: ReadonlyArray<readonly [number, string]> = [
    [100, "#e5cc80"],
    [99, "#e268a8"],
    [95, "#ff8000"],
    [75, "#a335ee"],
    [50, "#0070dd"],
    [25, "#1eff00"],
    [0, "#666666"],
];

export const PROG_COLOR = "#f59e0b";

// Only needed for the Lodestone fallback; Tomestone already groups jobs by role. Unlisted jobs are "other".
export const JOB_ROLES: Record<string, JobRole> = {
    "Paladin": "tanks", "Warrior": "tanks", "Dark Knight": "tanks", "Gunbreaker": "tanks",
    "White Mage": "healers", "Scholar": "healers", "Astrologian": "healers", "Sage": "healers",
    "Monk": "melee", "Dragoon": "melee", "Ninja": "melee", "Samurai": "melee", "Reaper": "melee", "Viper": "melee",
    "Bard": "ranged", "Machinist": "ranged", "Dancer": "ranged",
    "Black Mage": "casters", "Summoner": "casters", "Red Mage": "casters", "Pictomancer": "casters", "Blue Mage": "casters",
};
