/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TooltipContainer } from "@components/TooltipContainer";
import { classNameFactory } from "@utils/css";
import { useForceUpdater } from "@utils/react";
import { RelationshipStore, showToast, Tooltip, useEffect, UserProfileStore, useStateFromStores } from "@webpack/common";
import type { CSSProperties } from "react";

import { characterLinks, LINK_ICONS, relativeTime, statusLabel, TileModel } from "../services/display";
import { subscribe } from "../services/events";
import { NoteStore, resolveUser } from "../services/IdentityService";
import { ensurePassport, getPassportStateSync } from "../services/PassportAggregator";
import type { SourceStatus } from "../types";

export const cl = classNameFactory("vc-ffxiv-");

export function openExternal(url: string) {
    VencordNative.native.openExternal(url);
}

// Identity + passport for a Discord user; re-renders on plugin changes and on note/bio changes
export function useFfxivUser(userId: string) {
    const forceUpdate = useForceUpdater();
    useEffect(() => subscribe(forceUpdate), []);

    const lodestoneId = useStateFromStores(
        [NoteStore as any, RelationshipStore, UserProfileStore],
        () => resolveUser(userId)?.lodestoneId ?? null,
    );
    const identity = lodestoneId ? resolveUser(userId) : null;
    const state = lodestoneId ? getPassportStateSync(lodestoneId) : { passport: null, loading: false };

    useEffect(() => {
        if (lodestoneId) ensurePassport(lodestoneId).catch(() => { });
    }, [lodestoneId]);

    return { identity, lodestoneId, ...state };
}

const SOURCE_NAMES = { fflogs: "FF Logs", tomestone: "Tomestone", lodestone: "Lodestone" };

// "FF Logs · No Token"-style pills for every source that didn't answer; nothing when all is well
export function SourcePills({ sources, className }: { sources: Partial<Record<keyof typeof SOURCE_NAMES, SourceStatus>>; className?: string; }) {
    const problems = (Object.keys(SOURCE_NAMES) as Array<keyof typeof SOURCE_NAMES>)
        .map(k => ({ k, label: sources[k] && statusLabel(sources[k]!) }))
        .filter(p => p.label);
    if (!problems.length) return null;
    return (
        <div className={className} style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {problems.map(p => <span key={p.k} className={cl("pill", "status")}>{SOURCE_NAMES[p.k]} · {p.label}</span>)}
        </div>
    );
}

function RefreshIcon({ spinning }: { spinning: boolean; }) {
    return (
        <svg className={spinning ? cl("spin") : undefined} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 4a8 8 0 0 0-7.75 6H2l3.5 4L9 10H6.34A6 6 0 1 1 6 14.9l-1.73 1A8 8 0 1 0 12 4Z" />
        </svg>
    );
}

export function RefreshButton({ lodestoneId, fetchedAt, loading }: { lodestoneId: string; fetchedAt?: number; loading: boolean; }) {
    const tooltip = fetchedAt
        ? `Updated ${relativeTime(fetchedAt)} · Shift-click to force refresh`
        : "Refresh";

    async function onClick(e: React.MouseEvent) {
        const result = await ensurePassport(lodestoneId, e.shiftKey);
        if (result === "fresh")
            showToast({ text: "Already up to date. Shift-click to refresh anyway.", variant: "default" });
        else if (result === "cooldown")
            showToast({ text: "Refreshed less than a minute ago. Try again shortly.", variant: "default" });
    }

    // Hover props go straight onto the button; wrapped in TooltipContainer's div the tooltip never showed
    return (
        <Tooltip text={tooltip}>
            {tooltipProps => (
                <button {...tooltipProps} className={cl("icon-button")} onClick={onClick} disabled={loading} aria-label="Refresh FFXIV data">
                    <RefreshIcon spinning={loading} />
                </button>
            )}
        </Tooltip>
    );
}

const tileStyle = (t: TileModel): CSSProperties => ({
    borderColor: t.color ?? undefined,
    backgroundImage: t.bannerUrl ? `url("${t.bannerUrl}")` : undefined,
});

export function SavageTile({ tile }: { tile: TileModel; }) {
    return (
        <TooltipContainer text={tile.tooltip}>
            <div className={cl("tile")} data-kind={tile.kind} style={tileStyle(tile)}>
                {tile.door && <span className={cl("tile-door")}>P1</span>}
                {tile.corner && <span className={cl("tile-corner")} style={{ color: tile.color ?? undefined }}>{tile.corner}</span>}
                <span className={cl("tile-label")}>{tile.label}</span>
            </div>
        </TooltipContainer>
    );
}

export function UltimatePill({ tile }: { tile: TileModel; }) {
    return (
        <TooltipContainer text={tile.tooltip}>
            <div
                className={cl("ult")}
                data-kind={tile.kind}
                style={{ borderColor: tile.color ?? undefined, ["--vc-ffxiv-accent" as string]: tile.color ?? "#e5cc80" }}
            >
                <span>{tile.label}</span>
                <span className={cl("ult-value")} style={{ color: tile.color ?? undefined }}>{tile.corner ?? "–"}</span>
            </div>
        </TooltipContainer>
    );
}

export function ExternalLinks({ lodestoneId }: { lodestoneId: string; }) {
    const links = characterLinks(lodestoneId);
    const items = [
        { key: "tomestone", label: "Tomestone", url: links.tomestone, icon: LINK_ICONS.tomestone },
        { key: "fflogs", label: "FF Logs", url: links.fflogs, icon: LINK_ICONS.fflogs },
        { key: "lodestone", label: "Lodestone", url: links.lodestone, icon: LINK_ICONS.lodestone },
    ];
    return (
        <div className={cl("links")}>
            {items.map(i => (
                <button key={i.key} className={cl("link")} onClick={() => openExternal(i.url)}>
                    <img src={i.icon} alt="" />
                    {i.label}
                </button>
            ))}
        </div>
    );
}
