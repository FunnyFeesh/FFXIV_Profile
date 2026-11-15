/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ActiveProgression, ArtImage, CharacterInfo, FetchResult, JobLevel, JobRole, TomestoneData, TomestoneEncounterData } from "../types";

// Loose view of GET /api/character/profile/{id}; only the fields we read
interface TsProgression {
    displayPercent?: string | null;
    percent?: string | null;
    rawPercent?: number | null;
    mechanic?: { name?: string | null; } | null;
    private?: boolean;
    name?: string | null;
    updatedAt?: number | null;
}

interface TsEncounter {
    canonicalName: string;
    banner?: string | null;
    achievement?: { completedAt?: string | null; } | null;
    activity?: { completedAt?: number | null; } | null;
    progression?: TsProgression | null;
    encounters?: TsEncounter[];
}

interface TsJob {
    id?: number;
    name: string;
    slug: string;
    level: number;
}

interface TsImage {
    image?: string | null;
    backgroundPosition?: string | null;
}

interface TsProfile {
    name: string;
    server: string;
    datacenter: string;
    title?: { pre?: string | null; post?: string | null; } | null;
    freeCompany?: { name?: string | null; } | null;
    avatar?: string | null;
    portrait?: string | null;
    customImages?: Partial<Record<"portrait" | "banner" | "avatar", TsImage | null>> | null;
    encounters?: {
        savage?: TsEncounter[] | null;
        ultimate?: TsEncounter[] | null;
        savageProgressionTarget?: TsProgression | null;
        ultimateProgressionTarget?: TsProgression | null;
    } | null;
    profile?: {
        bio?: string | null;
        currentJob?: { id?: number; name?: string; level?: number; } | null;
        jobs?: Partial<Record<JobRole, TsJob[]>> | null;
        currentGearSetAndAttributes?: { gearSet?: { itemLevel?: number | null; } | null; } | null;
    } | null;
}

const HIDDEN_MARKER = "tomestone-hidden";

function toArt(img: TsImage | null | undefined): ArtImage | undefined {
    if (!img?.image) return undefined;
    return { url: img.image, position: img.backgroundPosition ?? undefined };
}

function toEncounter(e: TsEncounter): TomestoneEncounterData {
    const prog = e.progression;
    const isPrivate = !!prog?.private;
    return {
        bannerUrl: e.banner ?? null,
        cleared: !!(e.achievement?.completedAt || e.activity?.completedAt),
        progPoint: isPrivate ? null : prog?.displayPercent ?? prog?.percent ?? null,
        progMechanic: isPrivate ? null : prog?.mechanic?.name ?? null,
        progPercent: isPrivate ? null : prog?.rawPercent ?? null,
        progPrivate: isPrivate,
    };
}

function addEncounter(map: Record<string, TomestoneEncounterData>, e: TsEncounter) {
    const next = toEncounter(e);
    const prev = map[e.canonicalName];
    // Older tiers list the final boss both as the tier entry and as floor 4
    map[e.canonicalName] = prev
        ? {
            bannerUrl: prev.bannerUrl ?? next.bannerUrl,
            cleared: prev.cleared || next.cleared,
            progPoint: prev.progPoint ?? next.progPoint,
            progMechanic: prev.progMechanic ?? next.progMechanic,
            progPercent: prev.progPercent ?? next.progPercent,
            progPrivate: prev.progPrivate || next.progPrivate,
        }
        : next;
}

function toActive(p: TsProgression | null | undefined): ActiveProgression | null {
    if (!p?.name) return null;
    const isPrivate = !!p.private;
    return {
        name: p.name,
        percent: isPrivate ? null : p.displayPercent ?? p.percent ?? null,
        mechanic: isPrivate ? null : p.mechanic?.name ?? null,
        private: isPrivate,
        updatedAt: p.updatedAt ?? null,
    };
}

function toCharacter(p: TsProfile): CharacterInfo {
    const jobs: JobLevel[] = [];
    const byRole = p.profile?.jobs ?? {};
    for (const role of Object.keys(byRole) as JobRole[]) {
        for (const j of byRole[role] ?? []) jobs.push({ id: j.id, role, name: j.name, slug: j.slug, level: j.level });
    }

    const title = p.title?.pre || p.title?.post || undefined;
    const custom = p.customImages ?? {};

    return {
        name: p.name,
        world: p.server,
        dataCenter: p.datacenter,
        title,
        freeCompany: p.freeCompany?.name ?? undefined,
        activeJob: p.profile?.currentJob?.name,
        activeJobId: p.profile?.currentJob?.id,
        activeJobLevel: p.profile?.currentJob?.level,
        itemLevel: p.profile?.currentGearSetAndAttributes?.gearSet?.itemLevel ?? undefined,
        avatarUrl: p.avatar ?? undefined,
        lodestonePortraitUrl: p.portrait ?? undefined,
        customArt: {
            portrait: toArt(custom.portrait),
            banner: toArt(custom.banner),
            avatar: toArt(custom.avatar),
        },
        jobs,
    };
}

export function parseTomestoneProfile(json: unknown): FetchResult<TomestoneData> {
    const p = json as TsProfile;
    if (!p || typeof p !== "object" || typeof p.name !== "string")
        return { status: "error", message: "Unexpected Tomestone response" };

    if (p.profile?.bio?.toLowerCase().includes(HIDDEN_MARKER))
        return { status: "private" };

    const encounters: Record<string, TomestoneEncounterData> = {};
    for (const tier of p.encounters?.savage ?? []) {
        for (const floor of tier.encounters ?? []) addEncounter(encounters, floor);
        // The tier entry itself is the final boss (e.g. lindwurm-ii = M12S P2)
        addEncounter(encounters, tier);
    }
    for (const ult of p.encounters?.ultimate ?? []) addEncounter(encounters, ult);

    return {
        status: "ok",
        data: {
            character: toCharacter(p),
            encounters,
            activeProgression: {
                savage: toActive(p.encounters?.savageProgressionTarget),
                ultimate: toActive(p.encounters?.ultimateProgressionTarget),
            },
        },
    };
}
