/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { findStoreLazy } from "@webpack";
import { RelationshipStore, UserProfileStore } from "@webpack/common";

import { DATA_KEYS } from "../constants";
import type { CharacterLink, IdentityProvider, IdentitySource, LinkMap, ResolvedCharacterIdentity } from "../types";
import { detectSuggestion, forgetSuggestion } from "./AutoDetect";
import { emitChange } from "./events";
import { ParsedIdentity, parseIdentityText } from "./identityText";
import { Native, safeFetch } from "./ipc";

// Notes on any user live here as { loading, note }; RelationshipStore.getNote only covers relationships (checked live)
export const NoteStore = findStoreLazy("NoteStore") as { getNote(userId: string): { note?: string; } | undefined; };

function getNoteText(userId: string) {
    return NoteStore.getNote(userId)?.note || RelationshipStore.getNote(userId);
}

let links: LinkMap = {};
// Auto-detected matches the user rejected, per Discord user
let dismissed: Record<string, string[]> = {};

export async function loadLinks() {
    [links, dismissed] = await Promise.all([
        DataStore.get<LinkMap>(DATA_KEYS.links).then(v => v ?? {}),
        DataStore.get<Record<string, string[]>>(DATA_KEYS.dismissed).then(v => v ?? {}),
    ]);
}

export function getLink(discordUserId: string) {
    return links[discordUserId];
}

// characters[0] is the primary; an empty list removes the link
export async function setLink(discordUserId: string, characters: CharacterLink[]) {
    links = { ...links };
    if (characters.length) links[discordUserId] = { characters };
    else delete links[discordUserId];
    // Linking a character by hand overrides an earlier "Not them"
    if (characters[0] && isDismissed(discordUserId, characters[0].lodestoneId))
        await saveDismissed(discordUserId, getDismissed(discordUserId).filter(id => id !== characters[0].lodestoneId));
    await DataStore.set(DATA_KEYS.links, links);
    emitChange();
}

export function getDismissed(discordUserId: string) {
    return dismissed[discordUserId] ?? [];
}

function isDismissed(discordUserId: string, lodestoneId: string) {
    return getDismissed(discordUserId).includes(lodestoneId);
}

async function saveDismissed(discordUserId: string, ids: string[]) {
    dismissed = { ...dismissed };
    if (ids.length) dismissed[discordUserId] = ids;
    else delete dismissed[discordUserId];
    await DataStore.set(DATA_KEYS.dismissed, dismissed);
    emitChange();
}

// "Not them": never suggest (or auto-link) this character for this user again
export async function dismissSuggestion(discordUserId: string, lodestoneId: string) {
    forgetSuggestion(discordUserId);
    if (!isDismissed(discordUserId, lodestoneId))
        await saveDismissed(discordUserId, [...getDismissed(discordUserId), lodestoneId]);
}

export function clearDismissed(discordUserId: string) {
    return saveDismissed(discordUserId, []);
}

// Confirming a suggestion saves it exactly like a manual link
export function confirmSuggestion(discordUserId: string, identity: CharacterLink) {
    const alts = getLink(discordUserId)?.characters.slice(1) ?? [];
    const link: CharacterLink = { lodestoneId: identity.lodestoneId, name: identity.name, world: identity.world };
    return setLink(discordUserId, [link, ...alts.filter(a => a.lodestoneId !== link.lodestoneId)]);
}

// The character's Lodestone bio names this Discord user: save it, unless a link exists by now
function autoLink(discordUserId: string, link: CharacterLink) {
    if (getLink(discordUserId) || isDismissed(discordUserId, link.lodestoneId)) return;
    setLink(discordUserId, [link]).catch(() => { });
}

// "name@world" (lowercase) -> Lodestone ID, null = no exact match, undefined entry = not searched yet
const nameResults = new Map<string, string | null>();
const nameSearching = new Set<string>();

// Returns the cached ID, or undefined while the search runs (a change is emitted when it finishes)
function lookupName(name: string, world: string): string | null | undefined {
    const key = `${name}@${world}`.toLowerCase();
    if (nameResults.has(key)) return nameResults.get(key);
    if (!nameSearching.has(key)) {
        nameSearching.add(key);
        safeFetch(() => Native.searchLodestoneCharacter(name, world)).then(r => {
            nameSearching.delete(key);
            // Network errors aren't remembered, so the next render retries
            if (r.status === "ok") nameResults.set(key, r.data.lodestoneId);
            else if (r.status === "not_found") nameResults.set(key, null);
            emitChange();
        });
    }
    return undefined;
}

function fromParsed(parsed: ParsedIdentity | null, source: IdentitySource): ResolvedCharacterIdentity | null {
    if (!parsed) return null;
    if ("lodestoneId" in parsed) return { lodestoneId: parsed.lodestoneId, source };
    const lodestoneId = lookupName(parsed.name, parsed.world);
    return lodestoneId ? { lodestoneId, name: parsed.name, world: parsed.world, source } : null;
}

const providers: IdentityProvider[] = [
    {
        // Set from the "Link / Edit FFXIV Character" context menu
        id: "local_override",
        resolve(userId) {
            const primary = links[userId]?.characters[0];
            return primary ? { ...primary, source: "local_override" } : null;
        },
    },
    {
        id: "discord_note",
        resolve: userId => fromParsed(parseIdentityText(getNoteText(userId)), "discord_note"),
    },
    {
        // Only available once Discord has fetched that user's profile (e.g. popout opened); never bulk-fetched
        id: "discord_bio",
        resolve: userId => fromParsed(parseIdentityText(UserProfileStore.getUserProfile(userId)?.bio), "discord_bio"),
    },
];

// Cheap enough to run on every render: links are in memory and notes/bios/presence/members are synchronous store reads.
// Order: your link (manual override) → your note → their bio → auto-detected suggestion.
export function resolveUser(discordUserId: string): ResolvedCharacterIdentity | null {
    for (const p of providers) {
        try {
            const result = p.resolve(discordUserId);
            if (result) return result;
        } catch {
            // A store not ready yet shouldn't break the chain
        }
    }
    try {
        return detectSuggestion(discordUserId, id => isDismissed(discordUserId, id), autoLink);
    } catch {
        return null;
    }
}
