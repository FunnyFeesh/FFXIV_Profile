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

import { getLink, resolveUser, setLink } from "../services/IdentityService";
import { parseLinkInput } from "../services/identityText";
import { Native, safeFetch } from "../services/ipc";
import { ensurePassport } from "../services/PassportAggregator";
import type { CharacterLink } from "../types";

export function openLinkCharacterModal(user: User) {
    openModal(modalProps => <LinkCharacterModal user={user} modalProps={modalProps} />);
}

const SOURCE_LABELS = {
    local_override: "your link",
    discord_note: "your note on this user",
    discord_bio: "their bio",
};

function LinkCharacterModal({ user, modalProps }: { user: User; modalProps: RenderModalProps; }) {
    const existing = getLink(user.id)?.characters[0];
    const detected = resolveUser(user.id);

    const [input, setInput] = useState(existing ? existing.lodestoneId : "");
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
            link = { lodestoneId: parsed.lodestoneId };
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

    async function remove() {
        await setLink(user.id, []);
        modalProps.onClose();
    }

    const actions = [
        { text: "Cancel", variant: "secondary", onClick: modalProps.onClose },
        ...(existing ? [{ text: "Remove Link", variant: "critical-primary", onClick: remove }] : []),
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
                {detected && !existing && (
                    <Paragraph>
                        Currently detected from {SOURCE_LABELS[detected.source]} (Lodestone ID {detected.lodestoneId}). A link here takes priority.
                    </Paragraph>
                )}
                <section>
                    <Heading className={Margins.bottom8}>Character</Heading>
                    <TextInput
                        value={input}
                        onChange={setInput}
                        placeholder="Lodestone/Tomestone URL, Lodestone ID, or First Last @ World"
                        autoFocus
                    />
                </section>
            </Flex>
        </Modal>
    );
}
