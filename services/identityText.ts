/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Finds an FFXIV character reference in free text (Discord note or bio). Pure, unit-tested.

export type ParsedIdentity =
    | { lodestoneId: string; }
    | { name: string; world: string; };

const ID_PATTERNS = [
    // na./eu./jp./fr./de. Lodestone
    /finalfantasyxiv\.com\/lodestone\/character\/(\d{1,12})/i,
    /tomestone\.gg\/character\/(\d{1,12})/i,
    // "ffxiv:12345678" or "lodestone: 12345678"
    /\b(?:ffxiv|lodestone)\s*:\s*(\d{1,12})\b/i,
];

// FFXIV names: two parts, letters plus ' and -
const NAME_PART = "[A-Za-z'\\-]{2,15}";

const NAME_PATTERNS: Array<{ re: RegExp; name: number; world: number; }> = [
    // "ffxiv: First Last @ World"
    { re: new RegExp(`\\b(?:ffxiv|lodestone)\\s*:\\s*(${NAME_PART} ${NAME_PART})\\s*@\\s*([A-Za-z]{3,20})\\b`, "i"), name: 1, world: 2 },
    // fflogs.com/character/na/gilgamesh/First%20Last. The /character/id/<n> form is an FFLogs ID, not a Lodestone ID.
    { re: /fflogs\.com\/character\/(?:na|eu|jp|oc|cn|kr)\/([A-Za-z-]{3,20})\/([^/\s?#]+)/i, name: 2, world: 1 },
];

function safeDecode(s: string) {
    try {
        return decodeURIComponent(s);
    } catch {
        return s;
    }
}

// Link dialog input: anything parseIdentityText accepts, plus a bare ID or an untagged "First Last @ World"
export function parseLinkInput(text: string): ParsedIdentity | null {
    const t = text.trim();
    if (/^\d{1,12}$/.test(t)) return { lodestoneId: t };
    return parseIdentityText(t) ?? parseIdentityText(`ffxiv: ${t}`);
}

export function parseIdentityText(text: string | null | undefined): ParsedIdentity | null {
    if (!text) return null;

    for (const re of ID_PATTERNS) {
        const m = text.match(re);
        if (m) return { lodestoneId: m[1] };
    }

    for (const p of NAME_PATTERNS) {
        const m = text.match(p.re);
        if (!m) continue;
        const name = safeDecode(m[p.name]).replace(/\+/g, " ").trim();
        if (new RegExp(`^${NAME_PART} ${NAME_PART}$`).test(name))
            return { name, world: safeDecode(m[p.world]) };
    }

    return null;
}
