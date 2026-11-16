/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Pure presentation rules (no React), unit-tested

import { PARSE_COLORS, PROG_COLOR } from "../constants";
import type { EncounterProgOrParse, SourceStatus } from "../types";

export function parseColor(percent: number | null): string | null {
    if (percent == null) return null;
    const p = Math.floor(percent);
    return PARSE_COLORS.find(([min]) => p >= min)?.[1] ?? null;
}

// FFLogs shows percentiles floored
export const formatPercent = (percent: number) => String(Math.floor(percent));

// Tomestone "72.48% P2" -> "P2 72%"
export function compactProg(progPoint: string) {
    const m = progPoint.match(/^\s*([\d.]+)%\s*(P\d+)?/i);
    if (!m) return progPoint;
    return [m[2]?.toUpperCase(), `${Math.round(Number(m[1]))}%`].filter(Boolean).join(" ");
}

// "normal" = no Savage clear, parse or prog, but Normal-mode kills on FF Logs
export type TileKind = "parse" | "cleared" | "prog" | "private" | "normal" | "none";

export const killsText = (n: number) => `${n} kill${n === 1 ? "" : "s"}`;

// "Normal: 3 kills, 54 Best %"
export function normalText(n: NonNullable<EncounterProgOrParse["normal"]>) {
    return `Normal: ${killsText(n.killCount)}${n.bestPercent != null ? `, ${formatPercent(n.bestPercent)} Best %` : ""}`;
}

export interface TileModel {
    label: string;
    kind: TileKind;
    // Text in the tile's corner badge: Best %, ✓, prog, or nothing
    corner: string | null;
    // Border/number color; null = muted
    color: string | null;
    // The M12S tile is showing Part 1 (door boss)
    door: boolean;
    bannerUrl: string | null;
    tooltip: string;
}

function tooltipFor(e: EncounterProgOrParse) {
    const parts = [e.fullName];
    if (e.bestPercent != null) parts.push(`${formatPercent(e.bestPercent)} Best %`);
    if (e.killCount) parts.push(killsText(e.killCount));
    else if (e.cleared) parts.push("Cleared");
    if (!e.cleared && e.progPoint) parts.push(`Prog: ${e.progPoint}${e.progMechanic ? ` (${e.progMechanic})` : ""}`);
    if (!e.cleared && e.progPrivate) parts.push("Prog is private");
    if (!e.cleared && e.normal) parts.push(`No Savage clear · ${normalText(e.normal)}`);
    return parts.join(" · ");
}

export function tileFor(e: EncounterProgOrParse, label = e.shortName): TileModel {
    const base = { label, door: false, bannerUrl: e.bannerUrl, tooltip: tooltipFor(e) };
    if (e.bestPercent != null) return { ...base, kind: "parse", corner: formatPercent(e.bestPercent), color: parseColor(e.bestPercent) };
    if (e.cleared) return { ...base, kind: "cleared", corner: "✓", color: null };
    if (e.progPoint) return { ...base, kind: "prog", corner: compactProg(e.progPoint), color: PROG_COLOR };
    if (e.progPrivate) return { ...base, kind: "private", corner: null, color: null };
    if (e.normal) return { ...base, kind: "normal", corner: "NM", color: null };
    return { ...base, kind: "none", corner: null, color: null };
}

// Popout's single M12S tile: Part 2 when it has anything to show, otherwise Part 1 marked as the door boss
export function m12sTile(part1: EncounterProgOrParse, part2: EncounterProgOrParse): TileModel {
    const p2 = tileFor(part2, "M12S");
    if (p2.kind !== "none") return p2;
    const p1 = tileFor(part1, "M12S");
    return p1.kind === "none" ? p2 : { ...p1, door: true, tooltip: `Door boss · ${p1.tooltip}` };
}

const STATUS_LABELS: Partial<Record<SourceStatus, string>> = {
    no_token: "No Token",
    bad_token: "Bad Token",
    private: "Private",
    not_found: "Not Found",
    error: "Error",
};

export const statusLabel = (status: SourceStatus) => STATUS_LABELS[status] ?? null;

export function jobIconUrl(jobId: number | undefined) {
    if (jobId == null) return null;
    const icon = String(62100 + jobId).padStart(6, "0");
    return `https://v2.xivapi.com/api/asset?path=ui/icon/062000/${icon}_hr1.tex&format=png`;
}

// Tomestone 404s on /character/<id> alone; any slug after the ID works, the name is just nicer
export function tomestoneSlug(name: string | null | undefined) {
    const slug = (name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || "character";
}

export function characterLinks(lodestoneId: string, name?: string | null) {
    return {
        tomestone: `https://tomestone.gg/character/${lodestoneId}/${tomestoneSlug(name)}`,
        fflogs: `https://www.fflogs.com/character/lodestone-id/${lodestoneId}`,
        lodestone: `https://na.finalfantasyxiv.com/lodestone/character/${lodestoneId}/`,
    };
}

export const LINK_ICONS = {
    tomestone: "https://assets.tomestone.gg/static/logo.png",
    fflogs: "https://assets.tomestone.gg/static/fflogs.png",
    lodestone: "https://assets.tomestone.gg/static/lodestone.png",
};

export function relativeTime(ms: number, now = Date.now()) {
    const minutes = Math.floor((now - ms) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// FF Logs spec ("BlackMage") -> ClassJob ID, via the character's Tomestone job list
export function jobIdForSpec(spec: string | null, jobs: ReadonlyArray<{ id?: number; name: string; }>) {
    if (!spec) return undefined;
    const key = squash(spec);
    return jobs.find(j => squash(j.name) === key)?.id;
}
