/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Auto-detection: guesses a character from data Discord already loaded (presence, nicknames, roles) and
// checks it against the Lodestone. A guess is a suggestion until confirmed, except when the character's
// Lodestone bio names this Discord user's ID: that two-way link is saved automatically.
// Lookups only happen for profiles being looked at (popout, badges, link dialog), never for member lists.

import { GuildMemberStore, GuildRoleStore, GuildStore, PresenceStore, UserStore } from "@webpack/common";

import { bioMentionsDiscordId } from "../parsers/lodestone";
import { settings } from "../settings";
import type { CharacterLink, LodestoneMatches, LodestoneSearchScope, ResolvedCharacterIdentity } from "../types";
import { dataCenterFromRoles, isFfxivActivity, NameGuess, parseNickname, parseRichPresence } from "./detectText";
import { emitChange } from "./events";
import { Native, safeFetch } from "./ipc";

type DetectSource = "rich_presence" | "nickname";

interface Candidate extends NameGuess {
    source: DetectSource;
    evidence: string;
    // Narrows a world-less search, from world/DC roles
    dataCenter: string | null;
}

const describe = (g: NameGuess) => g.world ? `${g.name} @ ${g.world}` : g.name;

function richPresenceCandidate(userId: string, dataCenter: string | null): Candidate | null {
    for (const a of PresenceStore.getActivities(userId) ?? []) {
        if (!isFfxivActivity(a)) continue;
        const g = parseRichPresence(a);
        if (g) return { ...g, source: "rich_presence", evidence: `their FFXIV Rich Presence (${describe(g)})`, dataCenter };
    }
    return null;
}

// Every nickname this client has loaded for the user, plus their display name, and the role names beside them
function nicknamesAndRoles(userId: string) {
    const nicks: string[] = [];
    const roles: string[] = [];
    for (const guildId of GuildStore.getGuildIds()) {
        const member = GuildMemberStore.getMember(guildId, userId);
        if (!member) continue;
        if (member.nick) nicks.push(member.nick);
        for (const roleId of member.roles) {
            const name = GuildRoleStore.getRole(guildId, roleId)?.name;
            if (name) roles.push(name);
        }
    }
    const globalName = UserStore.getUser(userId)?.globalName;
    if (globalName) nicks.push(globalName);
    return { nicks, roles };
}

function nicknameCandidate(nicks: string[], dataCenter: string | null): Candidate | null {
    const guesses = new Map<string, { guess: NameGuess; raw: string; }>();
    for (const raw of nicks) {
        const g = parseNickname(raw);
        if (!g) continue;
        const key = g.name.toLowerCase();
        const prev = guesses.get(key);
        // Keep the variant that names a world
        if (!prev || (!prev.guess.world && g.world)) guesses.set(key, { guess: g, raw });
    }
    // Different names in different servers: no way to tell which is the character
    if (guesses.size !== 1) return null;
    const { guess, raw } = [...guesses.values()][0];
    return { ...guess, source: "nickname", evidence: `their nickname "${raw}"`, dataCenter };
}

function gatherCandidates(userId: string): Candidate[] {
    const { autoDetectRichPresence, autoDetectNicknames } = settings.store;
    if (!autoDetectRichPresence && !autoDetectNicknames) return [];

    const { nicks, roles } = nicknamesAndRoles(userId);
    const dataCenter = dataCenterFromRoles(roles);
    const out: Candidate[] = [];

    const rp = autoDetectRichPresence ? richPresenceCandidate(userId, dataCenter) : null;
    if (rp) out.push(rp);
    const nick = autoDetectNicknames ? nicknameCandidate(nicks, dataCenter) : null;
    if (nick && nick.name.toLowerCase() !== rp?.name.toLowerCase()) out.push(nick);
    return out;
}

// --- Lodestone lookups, cached for the session (hits and misses) ---

const searches = new Map<string, LodestoneMatches>();
const searching = new Set<string>();

// undefined while the search runs; a change is emitted when it finishes. Errors aren't cached, so a later render retries.
function search(name: string, scope: LodestoneSearchScope): LodestoneMatches | undefined {
    const key = `${name.toLowerCase()}|${JSON.stringify(scope)}`;
    const hit = searches.get(key);
    if (hit) return hit;
    if (!searching.has(key)) {
        searching.add(key);
        safeFetch(() => Native.searchLodestoneMatches(name, scope)).then(r => {
            searching.delete(key);
            if (r.status === "ok") searches.set(key, r.data);
            emitChange();
        });
    }
    return undefined;
}

const unique = (r: LodestoneMatches) => r.complete && r.matches.length === 1 ? r.matches[0] : null;

// Name + world: the exact match (names are unique per world). Name + data center: the only match in that DC,
// falling back to everywhere when the DC has none. Name alone: the only match on any world.
// null = no unambiguous match, undefined = still searching.
function resolveCandidate(c: Candidate): CharacterLink | null | undefined {
    const toLink = (m: { lodestoneId: string; name: string; world: string; } | null | undefined) =>
        m ? { lodestoneId: m.lodestoneId, name: m.name, world: m.world } : null;

    if (c.world) {
        const r = search(c.name, { world: c.world });
        return r && toLink(r.matches[0]);
    }
    if (c.dataCenter) {
        const r = search(c.name, { dataCenter: c.dataCenter });
        if (!r) return undefined;
        if (r.matches.length) return toLink(unique(r));
    }
    const r = search(c.name, {});
    return r && toLink(unique(r));
}

// --- Lodestone bio check: a bio naming the Discord user's ID turns a guess into a saved link ---

const bios = new Map<string, string>();
const bioFetching = new Set<string>();
const autoLinked = new Set<string>();

export type AutoLinkHandler = (userId: string, link: CharacterLink) => void;

function checkBio(userId: string, link: CharacterLink, onVerified: AutoLinkHandler) {
    const key = `${userId}:${link.lodestoneId}`;
    if (autoLinked.has(key)) return;

    const bio = bios.get(link.lodestoneId);
    if (bio !== undefined) {
        if (bioMentionsDiscordId(bio, userId)) {
            autoLinked.add(key);
            // Never write during a render
            setTimeout(() => onVerified(userId, { ...link, autoLinked: "lodestone_bio" }));
        }
        return;
    }
    if (bioFetching.has(link.lodestoneId)) return;
    bioFetching.add(link.lodestoneId);
    safeFetch(() => Native.fetchLodestoneBio(link.lodestoneId)).then(r => {
        bioFetching.delete(link.lodestoneId);
        if (r.status === "ok" || r.status === "not_found") bios.set(link.lodestoneId, r.status === "ok" ? r.data : "");
        checkBio(userId, link, onVerified);
    });
}

// Last suggestion per user this session, so it survives the player logging off (Rich Presence gone)
const remembered = new Map<string, ResolvedCharacterIdentity>();

export function forgetSuggestion(userId: string) {
    remembered.delete(userId);
}

// The auto-detected suggestion for a user, or null. Synchronous for badges and renders:
// Lodestone lookups run in the background and emit a change when they finish.
export function detectSuggestion(userId: string, isDismissed: (lodestoneId: string) => boolean, onVerified: AutoLinkHandler): ResolvedCharacterIdentity | null {
    if (!settings.store.autoDetectRichPresence && !settings.store.autoDetectNicknames) return null;

    for (const c of gatherCandidates(userId)) {
        const link = resolveCandidate(c);
        // Still searching: don't fall through to a weaker signal yet
        if (link === undefined) break;
        if (!link || isDismissed(link.lodestoneId)) continue;

        checkBio(userId, link, onVerified);
        const identity: ResolvedCharacterIdentity = { ...link, source: c.source, suggested: true, evidence: c.evidence };
        remembered.set(userId, identity);
        return identity;
    }

    const last = remembered.get(userId);
    if (last && isDismissed(last.lodestoneId)) {
        remembered.delete(userId);
        return null;
    }
    // While a search runs, or after the signal went away, keep showing what was found earlier
    return last ?? null;
}
