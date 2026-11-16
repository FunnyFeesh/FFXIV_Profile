/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgePosition, ProfileBadge } from "@api/Badges";

import { ULTIMATES } from "../constants";
import { getCachedSync } from "../services/CacheService";
import { characterLinks, formatPercent, jobIconUrl, LINK_ICONS } from "../services/display";
import { resolveUser } from "../services/IdentityService";
import { ensurePassport } from "../services/PassportAggregator";
import type { EncounterProgOrParse, RaiderPassport, UltimateKey } from "../types";
import { cl } from "./shared";

// No crest artwork source exists, so ultimate badges are small gold text chips labelled by the badge's name
const UltChip = ({ name }: ProfileBadge) => <span className={cl("badge-chip")}>{name}</span>;

function ultDescription(u: EncounterProgOrParse, metric: RaiderPassport["metric"]) {
    const details = [
        u.bestPercent != null && `${formatPercent(u.bestPercent)}% Best ${metric.toUpperCase()}`,
        u.killCount && `${u.killCount} Kill${u.killCount === 1 ? "" : "s"}`,
    ].filter(Boolean);
    return `${u.shortName}: Cleared${details.length ? ` (${details.join(", ")})` : ""}`;
}

function buildBadges(p: RaiderPassport): ProfileBadge[] {
    const badges: ProfileBadge[] = [];
    const c = p.character;
    const links = characterLinks(p.lodestoneId);

    const jobIcon = jobIconUrl(c?.activeJobId);
    if (c && jobIcon) {
        badges.push({
            id: "vc-ffxiv-job",
            description: `${c.name} @ ${c.world}${c.itemLevel ? ` — iLvl ${c.itemLevel}` : ""}`,
            iconSrc: jobIcon,
            link: links.tomestone,
        });
    }

    if (p.sources.fflogs === "ok")
        badges.push({ id: "vc-ffxiv-fflogs", description: "FF Logs", iconSrc: LINK_ICONS.fflogs, link: links.fflogs });

    for (const key of Object.keys(p.ultimates) as UltimateKey[]) {
        const u = p.ultimates[key];
        if (!u.cleared) continue;
        badges.push({
            id: `vc-ffxiv-${key}`,
            key: `vc-ffxiv-${key}`,
            name: ULTIMATES[key].shortName,
            description: ultDescription(u, p.metric),
            component: UltChip,
            link: links.tomestone,
        });
    }

    return badges;
}

// Discord asks for badges synchronously and doesn't re-ask when our data arrives,
// so badges come from the cache; a missing passport is fetched for the next time the profile opens
export const FfxivProfileBadge: ProfileBadge = {
    id: "vc-ffxiv-badges",
    position: BadgePosition.START,
    getBadges({ userId }) {
        const identity = resolveUser(userId);
        // Badges read as fact, so unconfirmed suggestions get none
        if (!identity || identity.suggested) return [];

        const passport = getCachedSync(identity.lodestoneId);
        if (!passport) {
            ensurePassport(identity.lodestoneId).catch(() => { });
            return [];
        }
        return buildBadges(passport);
    },
};
