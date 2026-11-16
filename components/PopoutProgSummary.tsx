/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { User } from "@vencord/discord-types";

import { CURRENT_SAVAGE_TIER, SAVAGE_TIERS } from "../constants";
import { m12sTile, tileFor } from "../services/display";
import type { RaiderPassport } from "../types";
import { openPassportModal } from "./PassportModal";
import { cl, RefreshButton, SavageTile, SourcePills, SuggestionBar, UltimatePill, useFfxivUser } from "./shared";

// Pinned tier: floors 1-3 as-is, then the door-collapsed 4th floor (two FFLogs encounters)
function savageTiles(p: RaiderPassport) {
    const floors = p.savageTiers[CURRENT_SAVAGE_TIER];
    if (floors.length === 5) return [...floors.slice(0, 3).map(f => tileFor(f)), m12sTile(floors[3], floors[4])];
    return floors.map(f => tileFor(f));
}

export function PopoutProgSummary({ user }: { user: User; }) {
    const { identity, lodestoneId, passport, loading } = useFfxivUser(user.id);
    if (!lodestoneId) return null;

    if (!passport) {
        return (
            <div className={cl("card", "popout")}>
                <SuggestionBar userId={user.id} identity={identity} />
                <span className={cl("empty")}>{loading ? "Loading FFXIV profile…" : "No FFXIV data yet."}</span>
            </div>
        );
    }

    const c = passport.character;
    const banner = c?.customArt.banner;
    const avatar = c?.customArt.avatar?.url ?? c?.avatarUrl;

    return (
        <div className={cl("card", "popout")} data-banner={!!banner}>
            {banner && <div className={cl("popout-banner")} style={{ backgroundImage: `url("${banner.url}")`, backgroundPosition: banner.position ?? "center" }} />}

            <div className={cl("identity")}>
                {avatar && <img className={cl("avatar")} src={avatar} alt="" />}
                <div className={cl("identity-text")}>
                    <span className={cl("name")}>{c?.name ?? "Unknown character"}</span>
                    {c && <span className={cl("pill")}>{c.dataCenter ? `${c.dataCenter} • ${c.world}` : c.world}</span>}
                </div>
                <RefreshButton lodestoneId={passport.lodestoneId} fetchedAt={passport.fetchedAt} loading={loading} />
            </div>

            <SuggestionBar userId={user.id} identity={identity} />

            {/* Lodestone only matters as the identity fallback, i.e. when Tomestone failed */}
            <SourcePills sources={{
                fflogs: passport.sources.fflogs,
                tomestone: passport.sources.tomestone,
                lodestone: c ? undefined : passport.sources.lodestone,
            }} />

            <div className={cl("section-head")}>{SAVAGE_TIERS[CURRENT_SAVAGE_TIER].label}</div>
            <div className={cl("savage-row")}>
                {savageTiles(passport).map(t => <SavageTile key={t.label} tile={t} />)}
            </div>

            <div className={cl("section-head")}>Ultimates</div>
            <div className={cl("ult-strip")}>
                {Object.values(passport.ultimates).map(u => <UltimatePill key={u.canonicalName} tile={tileFor(u)} />)}
            </div>

            <button className={cl("open-passport")} onClick={() => openPassportModal(user)}>Open FFXIV Passport</button>
        </div>
    );
}
