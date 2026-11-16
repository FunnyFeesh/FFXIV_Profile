/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Margins } from "@components/margins";
import { Paragraph } from "@components/Paragraph";
import type { RenderModalProps, User } from "@vencord/discord-types";
import { Modal, openModal, TextInput, useState } from "@webpack/common";

import { clearDismissed, dismissSuggestion, getDismissed, getLink, resolveUser, setLink } from "../services/IdentityService";
import { parseLinkInput } from "../services/identityText";
import { Native, safeFetch } from "../services/ipc";
import { ensurePassport } from "../services/PassportAggregator";
import type { CharacterLink, IdentitySource, ResolvedCharacterIdentity } from "../types";

export function openLinkCharacterModal(user: User) {
    openModal(modalProps => <LinkCharacterModal user={user} modalProps={modalProps} />);
}

const SOURCE_LABELS: Record<IdentitySource, string> = {
    local_override: "your link",
    discord_note: "your note on this user",
    discord_bio: "their bio",
    rich_presence: "their FFXIV Rich Presence",
    nickname: "their nickname",
};

const describe = (c: CharacterLink) => c.name ? `${c.name}${c.world ? ` @ ${c.world}` : ""}` : `Lodestone ID ${c.lodestoneId}`;

function DetectionNote({ existing, detected }: { existing?: CharacterLink; detected: ResolvedCharacterIdentity | null; }) {
    if (existing?.autoLinked === "lodestone_bio")
        return <Paragraph>Linked automatically: {describe(existing)}'s Lodestone profile names this Discord account. Save a different character to override it.</Paragraph>;
    if (existing || !detected) return null;
    if (detected.suggested)
        return <Paragraph>Suggested from {detected.evidence ?? SOURCE_LABELS[detected.source]}: {describe(detected)}. Save to confirm it, enter a different character, or choose Not them.</Paragraph>;
    return <Paragraph>Currently detected from {SOURCE_LABELS[detected.source]} (Lodestone ID {detected.lodestoneId}). A link here takes priority.</Paragraph>;
}

function LinkCharacterModal({ user, modalProps }: { user: User; modalProps: RenderModalProps; }) {
    const existing = getLink(user.id)?.characters[0];
    const detected = resolveUser(user.id);
    const suggestion = !existing && detected?.suggested ? detected : null;
    const [dismissedCount, setDismissedCount] = useState(getDismissed(user.id).length);

    // A suggestion is prefilled, so Save confirms it
    const [input, setInput] = useState(existing?.lodestoneId ?? suggestion?.lodestoneId ?? "");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function save() {
        const parsed = parseLinkInput(input);
        if (!parsed) {
            setError("Enter a Lodestone, Tomestone or FF Logs link, a Lodestone ID, or \"First Last @ World\".");
            return;
        }

        setSaving(true);
        setError(null);
        let link: CharacterLink;
        if ("lodestoneId" in parsed) {
            // Keep the suggestion's name and world when saving it unchanged
            link = suggestion?.lodestoneId === parsed.lodestoneId
                ? { lodestoneId: suggestion.lodestoneId, name: suggestion.name, world: suggestion.world }
                : { lodestoneId: parsed.lodestoneId };
        } else {
            const res = await safeFetch(() => Native.searchLodestoneCharacter(parsed.name, parsed.world));
            if (res.status !== "ok") {
                setSaving(false);
                setError(res.status === "not_found"
                    ? `No character named "${parsed.name}" on ${parsed.world}.`
                    : `Lodestone search failed${res.message ? `: ${res.message}` : ""}.`);
                return;
            }
            link = { lodestoneId: res.data.lodestoneId, name: res.data.name, world: res.data.world };
        }

        // Keep alts if the primary is being replaced
        const alts = getLink(user.id)?.characters.slice(1) ?? [];
        await setLink(user.id, [link, ...alts.filter(a => a.lodestoneId !== link.lodestoneId)]);
        ensurePassport(link.lodestoneId).catch(() => { });
        modalProps.onClose();
    }

    // Removing also rejects the character for auto-detection, so it doesn't come straight back as a suggestion
    async function remove() {
        await setLink(user.id, []);
        if (existing) await dismissSuggestion(user.id, existing.lodestoneId);
        modalProps.onClose();
    }

    async function rejectSuggestion() {
        if (suggestion) await dismissSuggestion(user.id, suggestion.lodestoneId);
        modalProps.onClose();
    }

    async function allowDismissed() {
        await clearDismissed(user.id);
        setDismissedCount(0);
        // The rejected character may now come back as a suggestion; prefill it like on open
        const next = resolveUser(user.id);
        if (!existing && next?.suggested && !input.trim()) setInput(next.lodestoneId);
    }

    const actions = [
        { text: "Cancel", variant: "secondary", onClick: modalProps.onClose },
        ...(existing ? [{ text: "Remove Link", variant: "critical-primary", onClick: remove }] : []),
        ...(suggestion ? [{ text: "Not them", variant: "secondary", onClick: rejectSuggestion }] : []),
        { text: "Save", variant: "primary", onClick: save, loading: saving, disabled: !input.trim() || saving },
    ];

    return (
        <Modal
            {...modalProps}
            title="Link FFXIV Character"
            subtitle={`Stored only on this device, for ${user.globalName ?? user.username}.`}
            actions={actions}
            notice={error ? { message: error, type: "critical" } : undefined}
        >
            <Flex flexDirection="column" gap={12}>
                <DetectionNote existing={existing} detected={detected} />
                <section>
                    <Heading className={Margins.bottom8}>Character</Heading>
                    <TextInput
                        value={input}
                        onChange={setInput}
                        placeholder="Lodestone/Tomestone URL, Lodestone ID, or First Last @ World"
                        autoFocus
                    />
                </section>
                {dismissedCount > 0 && (
                    <Paragraph>
                        {dismissedCount === 1 ? "1 character was" : `${dismissedCount} characters were`} rejected for auto-detection on this user.{" "}
                        <a role="button" style={{ cursor: "pointer" }} onClick={allowDismissed}>Allow again</a>
                    </Paragraph>
                )}
            </Flex>
        </Modal>
    );
}
