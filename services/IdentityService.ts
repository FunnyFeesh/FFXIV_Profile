/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { RelationshipStore, UserProfileStore } from "@webpack/common";

import { DATA_KEYS } from "../constants";
import type { CharacterLink, IdentityProvider, IdentitySource, LinkMap, ResolvedCharacterIdentity } from "../types";
import { emitChange } from "./events";
import { ParsedIdentity, parseIdentityText } from "./identityText";
import { Native, safeFetch } from "./ipc";

let links: LinkMap = {};

export async function loadLinks() {
    links = await DataStore.get<LinkMap>(DATA_KEYS.links) ?? {};
}

export function getLink(discordUserId: string) {
    return links[discordUserId];
}

// characters[0] is the primary; an empty list removes the link
export async function setLink(discordUserId: string, characters: CharacterLink[]) {
    links = { ...links };
    if (characters.length) links[discordUserId] = { characters };
    else delete links[discordUserId];
    await DataStore.set(DATA_KEYS.links, links);
    emitChange();
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
        resolve: userId => fromParsed(parseIdentityText(RelationshipStore.getNote(userId)), "discord_note"),
    },
    {
        // Only available once Discord has fetched that user's profile (e.g. popout opened); never bulk-fetched
        id: "discord_bio",
        resolve: userId => fromParsed(parseIdentityText(UserProfileStore.getUserProfile(userId)?.bio), "discord_bio"),
    },
];

// Cheap enough to run on every render: links are in memory and notes/bios are synchronous store reads
export function resolveUser(discordUserId: string): ResolvedCharacterIdentity | null {
    for (const p of providers) {
        try {
            const result = p.resolve(discordUserId);
            if (result) return result;
        } catch {
            // A store not ready yet shouldn't break the chain
        }
    }
    return null;
}
