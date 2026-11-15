/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { JOB_ROLES } from "../constants";
import type { CharacterInfo, JobLevel, LodestoneSearchResult } from "../types";

// Regex-based because native.ts has no DOM. Selectors checked against live pages on 2026-11-14.

function decode(s: string) {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&quot;/g, "\"")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .trim();
}

function match(html: string, re: RegExp) {
    const m = html.match(re);
    return m ? decode(m[1]) : undefined;
}

// "Gilgamesh [Aether]"
function splitWorld(s: string | undefined) {
    const m = s?.match(/^(.+?)\s*\[(.+?)\]/);
    return m ? { world: m[1], dataCenter: m[2] } : { world: s ?? "", dataCenter: "" };
}

export function parseLodestoneProfile(html: string): CharacterInfo | null {
    const name = match(html, /class="frame__chara__name">([^<]+)</);
    if (!name) return null;

    const { world, dataCenter } = splitWorld(match(html, /class="frame__chara__world">(?:<i[^>]*><\/i>)?([^<]+)</));

    const jobs: JobLevel[] = [];
    let activeJob: string | undefined;
    const activeIcon = html.match(/class="character__class_icon"><img src="([^"]+)"/)?.[1];

    // One list per role group (combat, combat, crafters, gatherers)
    const listHtml = [...html.matchAll(/class="character__level__list">([\s\S]*?)<\/div>/g)].map(m => m[1]).join("");
    for (const m of listHtml.matchAll(/<img src="([^"]+)"[^>]*data-tooltip="([^"]+)">([^<]*)<\/li>/g)) {
        // "Paladin / Gladiator" -> "Paladin", "Blue Mage (Limited Job)" -> "Blue Mage"
        const jobName = decode(m[2]).split(" / ")[0].replace(/\s*\(Limited Job\)$/, "");
        if (m[1] === activeIcon) activeJob = jobName;
        const level = parseInt(m[3], 10);
        if (!Number.isNaN(level))
            jobs.push({ role: JOB_ROLES[jobName] ?? "other", name: jobName, slug: jobName.toLowerCase().replace(/\s+/g, "-"), level });
    }

    const levelText = match(html, /class="character__class__data"><p>LEVEL\s*(\d+)/);

    return {
        name,
        world,
        dataCenter,
        title: match(html, /class="frame__chara__title">([^<]+)</),
        freeCompany: match(html, /class="character__freecompany__name">[\s\S]*?<h4><a[^>]*>([^<]+)<\/a>/),
        activeJob,
        activeJobLevel: levelText ? Number(levelText) : undefined,
        avatarUrl: match(html, /class="frame__chara__face">\s*<img src="([^"]+)"/),
        lodestonePortraitUrl: match(html, /class="character__detail__image"><a href="([^"]+)"/),
        customArt: {},
        jobs,
    };
}

export function parseLodestoneSearch(html: string): LodestoneSearchResult[] {
    const results: LodestoneSearchResult[] = [];
    const entries = html.matchAll(/<a href="\/lodestone\/character\/(\d+)\/" class="entry__link">([\s\S]*?)<\/a>/g);
    for (const [, id, body] of entries) {
        const name = match(body, /class="entry__name">([^<]+)</);
        const { world, dataCenter } = splitWorld(match(body, /class="entry__world">(?:<i[^>]*><\/i>)?([^<]+)</));
        if (name) results.push({ lodestoneId: id, name, world, dataCenter });
    }
    return results;
}

// Lodestone search is a substring match; only accept an exact name + world
export function findExactCharacter(results: LodestoneSearchResult[], name: string, world: string) {
    const n = name.trim().toLowerCase();
    const w = world.trim().toLowerCase();
    return results.find(r => r.name.toLowerCase() === n && r.world.toLowerCase() === w) ?? null;
}
