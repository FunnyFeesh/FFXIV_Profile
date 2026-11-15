/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { TextInput, useEffect, useState } from "@webpack/common";

import { markCredentialsChanged } from "../services/CacheService";
import { Native } from "../services/ipc";
import type { SecretKind } from "../types";

const FIELDS: Array<{ kind: SecretKind; label: string; hint: string; }> = [
    { kind: "fflogsClientId", label: "FFLogs Client ID", hint: "Create a client at fflogs.com/api/clients" },
    { kind: "fflogsClientSecret", label: "FFLogs Client Secret", hint: "Shown once when you create the client" },
    { kind: "tomestoneToken", label: "Tomestone API Token", hint: "Tomestone.gg → Account Settings → API Access Token" },
];

function SecretField({ kind, label, hint, saved, onChanged }: typeof FIELDS[number] & { saved: boolean; onChanged(): void; }) {
    const [value, setValue] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function save() {
        const res = await Native.setSecret(kind, value);
        if (res.ok) {
            setValue("");
            setError(null);
            onChanged();
        } else {
            setError(res.error);
        }
    }

    async function clear() {
        await Native.clearSecret(kind);
        setError(null);
        onChanged();
    }

    return (
        <section className={Margins.bottom16}>
            <Heading tag="h5">{label} — {saved ? "Saved" : "Not set"}</Heading>
            <Paragraph className={Margins.bottom8}>{hint}</Paragraph>
            <Flex gap="0.5em" alignItems="center">
                <TextInput
                    type="password"
                    autoComplete="off"
                    value={value}
                    onChange={setValue}
                    placeholder={saved ? "Enter a new value to replace it" : "Paste here"}
                    style={{ flex: 1 }}
                />
                <Button size="small" disabled={!value.trim()} onClick={save}>Save</Button>
                <Button size="small" variant="dangerSecondary" disabled={!saved} onClick={clear}>Clear</Button>
            </Flex>
            {error && (
                <Paragraph defaultColor={false} style={{ color: "var(--text-feedback-critical)" }} className={Margins.top8}>
                    {error}
                </Paragraph>
            )}
        </section>
    );
}

export function CredentialsSettings() {
    const [status, setStatus] = useState<Record<SecretKind, boolean> | null>(null);

    const refresh = () => Native.getSecretStatus().then(setStatus);
    useEffect(() => { refresh(); }, []);

    const onChanged = () => {
        refresh();
        markCredentialsChanged();
    };

    if (!status) return null;

    return (
        <div>
            <Heading tag="h4" className={Margins.bottom8}>API credentials</Heading>
            <Paragraph className={Margins.bottom16}>
                Encrypted with your OS keychain and stored on this device only. They are not part of Vencord settings sync and can't be read back here.
            </Paragraph>
            {FIELDS.map(f => (
                <SecretField key={f.kind} {...f} saved={status[f.kind]} onChanged={onChanged} />
            ))}
        </div>
    );
}
