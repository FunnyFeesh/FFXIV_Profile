/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { TooltipContainer } from "@components/TooltipContainer";
import { openImageModal } from "@utils/discord";
import type { RenderModalProps, User } from "@vencord/discord-types";
import { Modal, openModal, useState } from "@webpack/common";
import type { CSSProperties, ReactNode } from "react";

import { CURRENT_SAVAGE_TIER, SAVAGE_TIERS } from "../constants";
import { compactProg, formatPercent, jobIconUrl, jobIdForSpec, statusLabel, tileFor } from "../services/display";
import { isTierLoading, loadTier } from "../services/PassportAggregator";
import type { ActiveProgression, ArtImage, CharacterInfo, EncounterProgOrParse, JobRole, RaiderPassport, SavageTierKey } from "../types";
import { cl, ExternalLinks, RefreshButton, SourcePills, useFfxivUser } from "./shared";

const ROLE_LABELS: Record<JobRole, string> = {
    tanks: "Tanks", healers: "Healers", melee: "Melee", ranged: "Physical Ranged", casters: "Casters", other: "Crafters & Gatherers",
};

function formatKillTime(ms: number) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// FF Logs specs come as "BlackMage"
const spacedJob = (spec: string) => spec.replace(/([a-z])([A-Z])/g, "$1 $2");

function JobDrawer({ character }: { character: CharacterInfo; }) {
    const roles = [...new Set(character.jobs.map(j => j.role))];
    return (
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
    );
}

const worldLabel = (c: CharacterInfo) => c.dataCenter ? `${c.dataCenter} • ${c.world}` : c.world;

// Discord's image viewer needs the size up front
async function viewImage(url: string) {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { });
    openImageModal({ url, width: img.naturalWidth || 1600, height: img.naturalHeight || 400 });
}

// The character's Tomestone banner across the top, with their avatar, name and title over it
function BannerHero({ passport, character, banner, loading }: { passport: RaiderPassport; character: CharacterInfo; banner: ArtImage; loading: boolean; }) {
    const avatar = character.customArt.avatar?.url ?? character.avatarUrl;
    return (
        <div className={cl("hero")} style={{ backgroundImage: `url("${banner.url}")`, backgroundPosition: banner.position ?? "center" }}>
            <button className={cl("glass", "glass-subtle", "hero-view")} onClick={() => viewImage(banner.url)}>View banner</button>
            <div className={cl("hero-id")}>
                {avatar && <img className={cl("hero-avatar")} src={avatar} alt="" />}
                <div className={cl("hero-text")}>
                    {character.title && <span className={cl("hero-title")}>«{character.title}»</span>}
                    <span className={cl("hero-name")}>{character.name}</span>
                    <span className={cl("hero-world")}>{worldLabel(character)}</span>
                </div>
                <RefreshButton lodestoneId={passport.lodestoneId} fetchedAt={passport.fetchedAt} loading={loading} />
            </div>
        </div>
    );
}

// Narrow column: portrait, identity, job/iLvl, refresh and links, pinned while the stats scroll
function Rail({ passport, loading, identityInHero }: { passport: RaiderPassport; loading: boolean; identityInHero: boolean; }) {
    const c = passport.character;
    const custom = c?.customArt.portrait;
    const [useLodestone, setUseLodestone] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const showCustom = custom && !useLodestone;
    const url = showCustom ? custom.url : c?.lodestonePortraitUrl;
    const icon = jobIconUrl(c?.activeJobId);

    return (
        <aside className={cl("rail")}>
            <div
                className={cl("card", "portrait")}
                style={{ backgroundImage: url ? `url("${url}")` : undefined, backgroundPosition: showCustom ? custom.position ?? "top center" : "top center" }}
            >
                {custom && c?.lodestonePortraitUrl && (
                    <button className={cl("glass", "glass-subtle", "art-toggle")} onClick={() => setUseLodestone(v => !v)}>
                        {useLodestone ? "Tomestone art" : "Lodestone portrait"}
                    </button>
                )}
                {c && drawerOpen && <JobDrawer character={c} />}
            </div>

            {!identityInHero && (
                <div className={cl("rail-head")}>
                    <div className={cl("rail-id")}>
                        <div className={cl("rail-name")}>{c?.name ?? "Unknown character"}</div>
                        {c && <div className={cl("rail-world")}>{worldLabel(c)}</div>}
                    </div>
                    <RefreshButton lodestoneId={passport.lodestoneId} fetchedAt={passport.fetchedAt} loading={loading} />
                </div>
            )}

            {c && (
                <div className={cl("rail-pills")}>
                    <button className={cl("pill", "pill-button")} onClick={() => setDrawerOpen(o => !o)} aria-expanded={drawerOpen} title="Show job levels">
                        {icon && <img className={cl("job-icon")} src={icon} alt="" />}
                        <span className={cl("pill-text")}>{c.activeJob ?? "Jobs"}</span>
                    </button>
                    {c.itemLevel && <span className={cl("pill")}>iLvl {c.itemLevel}</span>}
                </div>
            )}

            <SourcePills sources={{ fflogs: passport.sources.fflogs, lodestone: c ? undefined : passport.sources.lodestone }} />
            <ExternalLinks lodestoneId={passport.lodestoneId} />
        </aside>
    );
}

const bannerStyle = (url: string | null): CSSProperties | undefined => url ? { backgroundImage: `url("${url}")` } : undefined;
const clampPercent = (n: number) => `${Math.max(0, Math.min(100, n))}%`;

// One row per boss: duty art, name and kill stats, best job icon, and Best % as a parse-coloured bar
function BossRow({ e, jobs }: { e: EncounterProgOrParse; jobs: CharacterInfo["jobs"]; }) {
    const tile = tileFor(e);
    const color = tile.color ?? undefined;
    const jobIcon = jobIconUrl(jobIdForSpec(e.bestJob, jobs));
    const stats = [
        e.killCount ? `${e.killCount} kill${e.killCount === 1 ? "" : "s"}` : null,
        e.fastestKillMs ? formatKillTime(e.fastestKillMs) : null,
    ].filter(Boolean).join(" · ");

    let result: ReactNode;
    if (e.bestPercent != null) {
        result = <>
            <span className={cl("result-value")} style={{ color }}>{formatPercent(e.bestPercent)}</span>
            <div className={cl("meter")}><div style={{ width: clampPercent(e.bestPercent), background: color }} /></div>
        </>;
    } else if (e.cleared) {
        result = <span className={cl("result-value", "result-clear")}>✓ Cleared</span>;
    } else if (e.progPoint) {
        result = <>
            <span className={cl("result-value", "result-small")} style={{ color }}>{compactProg(e.progPoint)}</span>
            {e.progPercent != null && <div className={cl("meter")}><div style={{ width: clampPercent(100 - e.progPercent), background: color }} /></div>}
        </>;
    } else {
        result = <span className={cl("result-none")}>{e.progPrivate ? "Private" : "Not cleared"}</span>;
    }

    return (
        <div className={cl("boss-row")} data-kind={tile.kind} title={tile.tooltip}>
            <div className={cl("boss-art")} style={bannerStyle(e.bannerUrl)}>
                <span>{e.shortName}</span>
            </div>
            <div className={cl("boss-info")}>
                <span className={cl("boss-name")}>{e.fullName}</span>
                {(stats || (!e.cleared && e.progMechanic)) && (
                    <span className={cl("boss-stats")}>{stats || e.progMechanic}</span>
                )}
            </div>
            <div className={cl("boss-job")}>
                {jobIcon
                    ? <img src={jobIcon} alt={spacedJob(e.bestJob!)} title={spacedJob(e.bestJob!)} />
                    : e.bestJob && <span title={spacedJob(e.bestJob)}>{spacedJob(e.bestJob).slice(0, 3)}</span>}
            </div>
            <div className={cl("boss-result")}>{result}</div>
        </div>
    );
}

function SavageCard({ passport }: { passport: RaiderPassport; }) {
    const [tier, setTier] = useState<SavageTierKey>(CURRENT_SAVAGE_TIER);
    const status = passport.tierFflogs[tier];
    const loading = isTierLoading(passport.lodestoneId, tier);
    const bosses = passport.savageTiers[tier];
    const jobs = passport.character?.jobs ?? [];

    function pick(next: SavageTierKey) {
        setTier(next);
        loadTier(passport.lodestoneId, next).catch(() => { });
    }

    return (
        <div className={cl("card", "tile-card")}>
            <div className={cl("section-head")}>
                <select className={cl("select")} value={tier} onChange={e => pick(e.currentTarget.value as SavageTierKey)}>
                    {(Object.keys(SAVAGE_TIERS) as SavageTierKey[]).map(k => <option key={k} value={k}>{SAVAGE_TIERS[k].label} (Savage)</option>)}
                </select>
                <span>{bosses.filter(b => b.cleared).length}/{bosses.length} cleared</span>
            </div>
            {/* The pinned tier shares the rail's FF Logs status; older tiers are fetched separately */}
            {loading
                ? <span className={cl("empty")}>Loading FF Logs…</span>
                : tier !== CURRENT_SAVAGE_TIER && statusLabel(status) && <span className={cl("pill", "status")}>FF Logs · {statusLabel(status)}</span>}
            <div className={cl("boss-list")}>
                {bosses.map(e => <BossRow key={e.canonicalName} e={e} jobs={jobs} />)}
            </div>
        </div>
    );
}

// Duty art tiles: full colour with a gold edge when cleared, greyed out otherwise
function UltimateTile({ u }: { u: EncounterProgOrParse; }) {
    const tile = tileFor(u);
    return (
        <TooltipContainer text={tile.tooltip}>
            <div className={cl("ult-tile")} data-kind={tile.kind} data-cleared={u.cleared} style={bannerStyle(u.bannerUrl)}>
                <span className={cl("ult-tile-name")}>{u.shortName}</span>
                {tile.corner && <span className={cl("ult-tile-value")} style={{ color: tile.color ?? undefined }}>{tile.corner}</span>}
                {tile.kind === "prog" && u.progPercent != null && (
                    <div className={cl("ult-tile-bar")}><div style={{ width: clampPercent(100 - u.progPercent) }} /></div>
                )}
            </div>
        </TooltipContainer>
    );
}

function UltimatesCard({ passport }: { passport: RaiderPassport; }) {
    const ults = Object.values(passport.ultimates);
    const cleared = ults.filter(u => u.cleared).length;
    return (
        <div className={cl("card", "tile-card")} data-gold={cleared > 0}>
            <div className={cl("section-head")}>
                <span>Ultimates</span>
                <span style={{ color: cleared ? "#e5cc80" : undefined }}>{cleared}/{ults.length} cleared</span>
            </div>
            <div className={cl("ult-tiles")}>
                {ults.map(u => <UltimateTile key={u.canonicalName} u={u} />)}
            </div>
        </div>
    );
}

// Tomestone's percent is boss HP remaining (e.g. "42.10% P2"), so the bar fills by HP removed
function ProgressRow({ label, p, bannerUrl }: { label: string; p: ActiveProgression; bannerUrl: string | null; }) {
    const hp = p.percent ? parseFloat(p.percent) : NaN;
    const phase = p.percent?.match(/P\d+/i)?.[0];
    const detail = p.private
        ? "Private"
        : [phase && `Phase ${phase.slice(1)}`, !Number.isNaN(hp) && `${hp}% HP left`, p.mechanic].filter(Boolean).join(" · ");
    return (
        <div className={cl("prog-banner")} style={bannerStyle(bannerUrl)}>
            <span className={cl("prog-label")}>{label}</span>
            <span className={cl("prog-name")}>{p.name}</span>
            {detail && <span className={cl("prog-detail")}>{detail}</span>}
            {!p.private && !Number.isNaN(hp) && (
                <div className={cl("bar")}><div style={{ width: clampPercent(100 - hp) }} /></div>
            )}
        </div>
    );
}

function ProgressionCard({ passport }: { passport: RaiderPassport; }) {
    const { savage, ultimate } = passport.activeProgression;
    const status = statusLabel(passport.sources.tomestone);
    // Tomestone names the target by duty name; borrow that duty's art when we know it
    const all = [...Object.values(passport.savageTiers).flat(), ...Object.values(passport.ultimates)];
    const bannerFor = (name: string) => all.find(e => name === e.fullName || name.includes(e.fullName))?.bannerUrl ?? null;
    return (
        <div className={cl("card", "tile-card")}>
            <div className={cl("section-head")}>Current prog</div>
            {status && <span className={cl("pill", "status")}>Tomestone · {status}</span>}
            {(savage || ultimate) && (
                <div className={cl("prog-grid")}>
                    {savage && <ProgressRow label="Savage" p={savage} bannerUrl={bannerFor(savage.name)} />}
                    {ultimate && <ProgressRow label="Ultimate" p={ultimate} bannerUrl={bannerFor(ultimate.name)} />}
                </div>
            )}
            {!status && !savage && !ultimate && <span className={cl("empty")}>No active progression.</span>}
        </div>
    );
}

function PassportBody({ user }: { user: User; }) {
    const { lodestoneId, passport, loading } = useFfxivUser(user.id);

    if (!lodestoneId)
        return <span className={cl("empty")}>No FFXIV character linked. Right-click the user → Link / Edit FFXIV Character.</span>;
    if (!passport)
        return <span className={cl("empty")}>{loading ? "Loading FFXIV profile…" : "No FFXIV data yet."}</span>;

    const banner = passport.character?.customArt.banner;
    return (
        <>
            {banner && <BannerHero passport={passport} character={passport.character!} banner={banner} loading={loading} />}
            <div className={cl("layout")}>
                <Rail passport={passport} loading={loading} identityInHero={!!banner} />
                <div className={cl("main")}>
                    <SavageCard passport={passport} />
                    <UltimatesCard passport={passport} />
                    <ProgressionCard passport={passport} />
                </div>
            </div>
        </>
    );
}

function PassportModal({ user, modalProps }: { user: User; modalProps: RenderModalProps; }) {
    return (
        <Modal {...modalProps} size="xxl" title="FFXIV Passport" subtitle={user.globalName ?? user.username}>
            <ErrorBoundary noop>
                <div className={cl("modal")}>
                    <PassportBody user={user} />
                </div>
            </ErrorBoundary>
        </Modal>
    );
}

export function openPassportModal(user: User) {
    openModal(modalProps => <PassportModal user={user} modalProps={modalProps} />);
}
