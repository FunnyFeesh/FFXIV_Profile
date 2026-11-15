/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PROG_COLOR } from "../constants";
import { compactProg, jobIconUrl, m12sTile, parseColor, relativeTime, statusLabel, tileFor } from "../services/display";
import type { EncounterProgOrParse } from "../types";

const enc = (over: Partial<EncounterProgOrParse> = {}): EncounterProgOrParse => ({
    canonicalName: "x", shortName: "M9S", fullName: "Vamp Fatale", cleared: false, killCount: null,
    bestPercent: null, bestJob: null, fastestKillMs: null, progPoint: null, progMechanic: null,
    progPercent: null, progPrivate: false, bannerUrl: null, ...over,
});

test("parse colors follow FFLogs tiers on the floored percent", () => {
    assert.equal(parseColor(100), "#e5cc80");
    assert.equal(parseColor(99.9), "#e268a8");
    assert.equal(parseColor(95), "#ff8000");
    assert.equal(parseColor(94.99), "#a335ee");
    assert.equal(parseColor(50), "#0070dd");
    assert.equal(parseColor(25), "#1eff00");
    assert.equal(parseColor(24.9), "#666666");
    assert.equal(parseColor(0), "#666666");
    assert.equal(parseColor(null), null);
});

test("compact prog", () => {
    assert.equal(compactProg("72.48% P2"), "P2 72%");
    assert.equal(compactProg("5.2%"), "5%");
    assert.equal(compactProg("Enrage"), "Enrage");
});

test("tile priority: parse, then cleared, then prog, then private", () => {
    assert.deepEqual(
        [tileFor(enc({ bestPercent: 96.7, cleared: true, killCount: 4 })).corner, tileFor(enc({ bestPercent: 96.7 })).color],
        ["96", "#ff8000"],
    );
    assert.equal(tileFor(enc({ cleared: true })).corner, "✓");
    const prog = tileFor(enc({ progPoint: "42.1% P2", progMechanic: "Arena Split" }));
    assert.deepEqual([prog.kind, prog.corner, prog.color], ["prog", "P2 42%", PROG_COLOR]);
    assert.match(prog.tooltip, /Prog: 42\.1% P2 \(Arena Split\)/);
    assert.equal(tileFor(enc({ progPrivate: true })).kind, "private");
    assert.equal(tileFor(enc()).kind, "none");
});

test("tooltip includes kills and best %", () => {
    assert.equal(tileFor(enc({ bestPercent: 88, killCount: 1, cleared: true })).tooltip, "Vamp Fatale · 88 Best % · 1 kill");
    assert.equal(tileFor(enc({ cleared: true })).tooltip, "Vamp Fatale · Cleared");
});

test("M12S door collapse", () => {
    const p1 = (o = {}) => enc({ shortName: "M12S P1", fullName: "Lindwurm", ...o });
    const p2 = (o = {}) => enc({ shortName: "M12S P2", fullName: "Lindwurm II", ...o });

    // Part 2 cleared: its parse, no door marker
    let t = m12sTile(p1({ cleared: true, bestPercent: 70 }), p2({ cleared: true, bestPercent: 99 }));
    assert.deepEqual([t.label, t.corner, t.door], ["M12S", "99", false]);

    // Progging Part 2
    t = m12sTile(p1({ cleared: true }), p2({ progPoint: "30% P2" }));
    assert.deepEqual([t.kind, t.door], ["prog", false]);

    // Part 1 cleared, Part 2 untouched: door marker on Part 1
    t = m12sTile(p1({ cleared: true, bestPercent: 80 }), p2());
    assert.deepEqual([t.corner, t.door, t.label], ["80", true, "M12S"]);
    assert.match(t.tooltip, /^Door boss/);

    // Progging Part 1
    t = m12sTile(p1({ progPoint: "60% P1" }), p2());
    assert.deepEqual([t.kind, t.door], ["prog", true]);

    // Nothing at all
    t = m12sTile(p1(), p2());
    assert.deepEqual([t.kind, t.door, t.label], ["none", false, "M12S"]);
});

test("status labels only for problems", () => {
    assert.equal(statusLabel("no_token"), "No Token");
    assert.equal(statusLabel("private"), "Private");
    assert.equal(statusLabel("ok"), null);
    assert.equal(statusLabel("skipped"), null);
});

test("job icon URL", () => {
    assert.equal(jobIconUrl(42), "https://v2.xivapi.com/api/asset?path=ui/icon/062000/062142_hr1.tex&format=png");
    assert.equal(jobIconUrl(undefined), null);
});

test("relative time", () => {
    const now = 10 * 3_600_000;
    assert.equal(relativeTime(now - 30_000, now), "just now");
    assert.equal(relativeTime(now - 5 * 60_000, now), "5m ago");
    assert.equal(relativeTime(now - 2 * 3_600_000, now), "2h ago");
    assert.equal(relativeTime(now - 50 * 3_600_000, now), "2d ago");
});
