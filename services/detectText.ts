/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Auto-detection parsers: character name guesses from server nicknames, Rich Presence and roles.
// Pure and unit-tested. A guess is only ever *suggested*; it never links on its own.

import { dataCenterOf, findDataCenter, findWorld } from "./worlds";

export interface NameGuess {
    name: string;
    // Canonical world name, only when it was stated and is a real public world
    world?: string;
}

// Forenames and surnames are 2-15 characters each, 20 combined; letters plus ' and -
export function isCharacterName(name: string) {
    const parts = name.split(" ");
    if (parts.length !== 2) return false;
    const [first, last] = parts;
    return /^[A-Za-z][A-Za-z'-]{1,14}$/.test(first)
        && /^[A-Za-z][A-Za-z'-]{1,14}$/.test(last)
        && first.length + last.length <= 20;
}

// Capitalised parts only: the game capitalises names, and lowercase nicknames are rarely character names
const NICK_RE = /^([A-Z][A-Za-z'-]{1,14})\s+([A-Z][A-Za-z'-]{1,14})(?:\s*(?:@\s*|[([]\s*)([A-Za-z]{3,20})\s*[)\]]?)?$/;

function parseNickSegment(seg: string): NameGuess | null {
    const m = seg.trim().match(NICK_RE);
    if (!m) return null;
    const name = `${m[1]} ${m[2]}`;
    if (!isCharacterName(name)) return null;
    if (!m[3]) return { name };
    // A trailing word that isn't a world ("First Last (Mentor)") means this isn't the expected shape
    const world = findWorld(m[3]);
    return world ? { name, world } : null;
}

// "First Last", "First Last (World)", "First Last @ World", "[TAG] First Last", "Nick | First Last", emoji around it.
// Tries each |/•/· segment from the last one back, since "Nick | First Last" is the common order.
export function parseNickname(nick: string | null | undefined): NameGuess | null {
    if (!nick) return null;
    const cleaned = nick
        .replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|[\u{2600}-\u{27BF}]/gu, " ")
        // Leading [TAG], 【TAG】, {TAG} or <TAG>
        .replace(/^\s*(?:\[[^\]]*\]|【[^】]*】|\{[^}]*\}|<[^>]*>)\s*/u, "")
        .replace(/\s+/g, " ")
        .trim();

    const segments = cleaned.split(/\s*[|•·~]\s*/);
    for (let i = segments.length - 1; i >= 0; i--) {
        const guess = parseNickSegment(segments[i]);
        if (guess) return guess;
    }
    return null;
}

// Dalamud "Discord Rich Presence" plugin's Discord application (Dalamud.RichPresence, DiscordPresenceManager.cs)
export const FFXIV_RICH_PRESENCE_APP_ID = "478143453536976896";

export interface ActivityLike {
    name?: string;
    application_id?: string;
    details?: string;
    state?: string;
    assets?: { large_text?: string; };
}

export function isFfxivActivity(a: ActivityLike) {
    return a.application_id === FFXIV_RICH_PRESENCE_APP_ID || /^final fantasy xiv\b/i.test(a.name ?? "");
}

// Dalamud.RichPresence (checked against its source): details = "Name", "Name «FC»", or "Name ❀ HomeWorld" when
// visiting another world; state = the current world. With the name hidden, details is the zone (= large_text).
// Menus, login queue and duty states carry no world, so a guess needs a structural anchor:
// a ❀ home world, an «FC» tag (only shown on the home world), or a state that is a real world.
export function parseRichPresence(a: ActivityLike): NameGuess | null {
    const details = a.details?.trim();
    if (!details || details === a.assets?.large_text?.trim()) return null;

    let name = details;
    let world: string | null = null;
    let anchored = false;

    const visiting = details.match(/^(.+?)\s*❀\s*([A-Za-z]+)$/u);
    if (visiting) {
        name = visiting[1];
        world = findWorld(visiting[2]);
        anchored = !!world;
    } else {
        const fc = details.match(/^(.+?)\s*«[^»]*»$/u);
        if (fc) {
            name = fc[1];
            anchored = true;
        }
        // Not visiting, so the current world is the home world
        world = findWorld(a.state);
        anchored ||= !!world;
    }

    name = name.trim();
    if (!anchored || !isCharacterName(name)) return null;
    return world ? { name, world } : { name };
}

// A data-center hint from role names: roles named after a world or data center ("Aether", "Gilgamesh").
// Returns the one data center they point to, or null when there is none or they disagree.
export function dataCenterFromRoles(roleNames: Iterable<string>): string | null {
    const dcs = new Set<string>();
    for (const raw of roleNames) {
        const role = raw.replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}/gu, "").trim();
        const dc = findDataCenter(role) ?? (findWorld(role) && dataCenterOf(role));
        if (dc) dcs.add(dc);
    }
    return dcs.size === 1 ? [...dcs][0] : null;
}
