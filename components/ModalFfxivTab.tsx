/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { User } from "@vencord/discord-types";
import { useState } from "@webpack/common";

import { CURRENT_SAVAGE_TIER, SAVAGE_TIERS } from "../constants";
import { compactProg, formatPercent, jobIconUrl, statusLabel, tileFor } from "../services/display";
import { isTierLoading, loadTier } from "../services/PassportAggregator";
import type { ActiveProgression, CharacterInfo, EncounterProgOrParse, JobRole, RaiderPassport, SavageTierKey } from "../types";
import { cl, ExternalLinks, RefreshButton, SourcePills, UltimatePill, useFfxivUser } from "./shared";

const ROLE_LABELS: Record<JobRole, string> = {
    tanks: "Tanks", healers: "Healers", melee: "Melee", ranged: "Physical Ranged", casters: "Casters", other: "Crafters & Gatherers",
};

function formatKillTime(ms: number) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Portrait({ character }: { character: CharacterInfo; }) {
    const custom = character.customArt.portrait;
    const [useLodestone, setUseLodestone] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const showCustom = custom && !useLodestone;
    const url = showCustom ? custom.url : character.lodestonePortraitUrl;
    const icon = jobIconUrl(character.activeJobId);

    const roles = [...new Set(character.jobs.map(j => j.role))];

    return (
        <div
            className={cl("card", "portrait")}
            style={{ backgroundImage: url ? `url("${url}")` : undefined, backgroundPosition: showCustom ? custom.position ?? "top center" : "top center" }}
        >
            {drawerOpen && (
                <div className={cl("drawer")}>
                    {character.title && <div>«{character.title}»</div>}
                    {character.freeCompany && <div>Free Company: {character.freeCompany}</div>}
                    {roles.map(role => (
                        <section key={role}>
                            <h4>{ROLE_LABELS[role]}</h4>
                            <div className={cl("jobs")}>
                                {character.jobs.filter(j => j.role === role).map(j => (
                                    <span key={j.slug} className={cl("job")} data-unleveled={j.level === 0} title={j.name}>
                                        {j.id != null && <img className={cl("job-icon")} src={jobIconUrl(j.id)!} alt="" />}
                                        {j.level || "–"}
                                    </span>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            <div className={cl("portrait-pills")}>
                <button className={cl("glass")} onClick={() => setDrawerOpen(o => !o)} aria-expanded={drawerOpen}>
                    {icon && <img className={cl("job-icon")} src={icon} alt="" />}
                    {[character.itemLevel && `iLvl ${character.itemLevel}`, character.activeJob].filter(Boolean).join(" • ") || "Jobs"}
                </button>
                {custom && character.lodestonePortraitUrl && (
                    <button className={cl("glass")} onClick={() => setUseLodestone(v => !v)}>
                        {useLodestone ? "Show Tomestone Art" : "Switch to Lodestone Portrait"}
                    </button>
                )}
            </div>
        </div>
    );
}

function BossCard({ e }: { e: EncounterProgOrParse; }) {
    const tile = tileFor(e);
    const value = e.bestPercent != null
        ? formatPercent(e.bestPercent)
        : e.cleared ? "✓" : e.progPoint ? compactProg(e.progPoint) : e.progPrivate ? "Private" : "–";
    const meta = [
        e.killCount ? `${e.killCount}x` : null,
        e.fastestKillMs ? formatKillTime(e.fastestKillMs) : null,
        e.bestJob,
        !e.cleared && e.progMechanic ? e.progMechanic : null,
    ].filter(Boolean).join(" · ");

    return (
        <div
            className={cl("boss")}
            title={tile.tooltip}
            style={{ borderColor: tile.color ?? undefined, backgroundImage: e.bannerUrl ? `url("${e.bannerUrl}")` : undefined }}
        >
            <span className={cl("boss-name")}>{e.shortName} · {e.fullName}</span>
            <span className={cl("boss-value")} style={{ color: tile.color ?? undefined }}>{value}</span>
            {meta && <span className={cl("boss-meta")}>{meta}</span>}
        </div>
    );
}

function SavageCard({ passport }: { passport: RaiderPassport; }) {
    const [tier, setTier] = useState<SavageTierKey>(CURRENT_SAVAGE_TIER);
    const status = passport.tierFflogs[tier];
    const loading = isTierLoading(passport.lodestoneId, tier);

    function pick(next: SavageTierKey) {
        setTier(next);
        loadTier(passport.lodestoneId, next).catch(() => { });
    }

    return (
        <div className={cl("card", "tile-card")}>
            <div className={cl("section-head")}>
                <span>Savage</span>
                <select className={cl("select")} value={tier} onChange={e => pick(e.currentTarget.value as SavageTierKey)}>
                    {(Object.keys(SAVAGE_TIERS) as SavageTierKey[]).map(k => <option key={k} value={k}>{SAVAGE_TIERS[k].label}</option>)}
                </select>
            </div>
            {/* The pinned tier shares the header's FF Logs status; older tiers are fetched separately */}
            {loading
                ? <span className={cl("empty")}>Loading FF Logs…</span>
                : tier !== CURRENT_SAVAGE_TIER && statusLabel(status) && <span className={cl("pill", "status")}>FF Logs · {statusLabel(status)}</span>}
            <div className={cl("boss-grid")}>
                {passport.savageTiers[tier].map(e => <BossCard key={e.canonicalName} e={e} />)}
            </div>
        </div>
    );
}

function UltimatesCard({ passport }: { passport: RaiderPassport; }) {
    const ults = Object.values(passport.ultimates);
    const cleared = ults.filter(u => u.cleared).length;
    return (
        <div className={cl("card", "tile-card")} data-gold={cleared > 0}>
            <div className={cl("section-head")}>
                <span>Ultimate Raids</span>
                <span style={{ color: cleared ? "#e5cc80" : undefined }}>{cleared}/{ults.length}</span>
            </div>
            <div className={cl("ult-grid")}>
                {ults.map(u => <UltimatePill key={u.canonicalName} tile={tileFor(u)} />)}
            </div>
        </div>
    );
}

// Tomestone's percent is boss HP remaining (e.g. "42.10% P2"), so the bar fills by HP removed
function ProgressRow({ label, p }: { label: string; p: ActiveProgression; }) {
    const hp = p.percent ? parseFloat(p.percent) : NaN;
    const phase = p.percent?.match(/P\d+/i)?.[0];
    return (
        <div className={cl("progress")}>
            <span>
                <b>{label}: {p.name}</b>
                {p.private
                    ? " — private"
                    : [phase && ` — Phase ${phase.slice(1)}`, !Number.isNaN(hp) && ` (${hp}% HP)`, p.mechanic && ` · ${p.mechanic}`].filter(Boolean).join("")}
            </span>
            {!p.private && !Number.isNaN(hp) && (
                <div className={cl("bar")}><div style={{ width: `${Math.max(0, Math.min(100, 100 - hp))}%` }} /></div>
            )}
        </div>
    );
}

function ProgressionCard({ passport }: { passport: RaiderPassport; }) {
    const { savage, ultimate } = passport.activeProgression;
    const status = statusLabel(passport.sources.tomestone);
    return (
        <div className={cl("card", "tile-card", "span")}>
            <div className={cl("section-head")}>Active Tomestone Progression</div>
            {status && <span className={cl("pill", "status")}>Tomestone · {status}</span>}
            {savage && <ProgressRow label="Savage" p={savage} />}
            {ultimate && <ProgressRow label="Ultimate" p={ultimate} />}
            {!status && !savage && !ultimate && <span className={cl("empty")}>No active progression.</span>}
        </div>
    );
}

export function ModalFfxivTab({ user }: { user: User; }) {
    const { lodestoneId, passport, loading } = useFfxivUser(user.id);

    if (!lodestoneId) {
        return (
            <div className={cl("modal")}>
                <span className={cl("empty")}>No FFXIV character linked. Right-click the user → Link / Edit FFXIV Character.</span>
            </div>
        );
    }
    if (!passport) {
        return <div className={cl("modal")}><span className={cl("empty")}>{loading ? "Loading FFXIV profile…" : "No FFXIV data yet."}</span></div>;
    }

    const c = passport.character;
    return (
        <div className={cl("modal")}>
            {c ? <Portrait character={c} /> : <div className={cl("card", "portrait")} />}

            <div className={cl("right")}>
                <div className={cl("span")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                        <div className={cl("name")}>{c?.name ?? "Unknown character"}</div>
                        {c && <span className={cl("pill")}>{c.dataCenter ? `${c.dataCenter} • ${c.world}` : c.world}</span>}
                    </div>
                    <RefreshButton lodestoneId={passport.lodestoneId} fetchedAt={passport.fetchedAt} loading={loading} />
                </div>
                <SourcePills className={cl("span")} sources={{ fflogs: passport.sources.fflogs, lodestone: c ? undefined : passport.sources.lodestone }} />

                <SavageCard passport={passport} />
                <UltimatesCard passport={passport} />
                <ProgressionCard passport={passport} />

                <div className={cl("span")}><ExternalLinks lodestoneId={passport.lodestoneId} /></div>
            </div>
        </div>
    );
}
