/*
 * Copyright 2024 New Vector Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
 * Please see LICENSE files in the repository root for full details.
 */

import React, { JSX, MouseEventHandler, useCallback, useEffect, useState } from "react";
import { Button, InlineSpinner } from "@vector-im/compound-web";
import KeyIcon from "@vector-im/compound-design-tokens/assets/web/icons/key";

import { SettingsSection } from "../shared/SettingsSection";
import { _t } from "../../../../languageHandler";
import { useMatrixClientContext } from "../../../../contexts/MatrixClientContext";
import { SettingsHeader } from "../SettingsHeader";
import { accessSecretStorage } from "../../../../SecurityManager";
import { SettingsSubheader } from "../SettingsSubheader";

/**
 * The possible states of the recovery panel.
 * - `loading`: We are checking the backup, the recovery and the secrets.
 * - `missing_backup`: The user has no backup.
 * - `secrets_not_cached`: The user has a backup but the secrets are not cached.
 * - `good`: The user has a backup and the secrets are cached.
 */
type State = "loading" | "missing_backup" | "secrets_not_cached" | "good";

interface RecoveryPanelProps {
    /**
     * Callback for when the user clicks the button to set up their recovery key.
     */
    onSetUpRecoveryClick: MouseEventHandler<HTMLButtonElement>;
    /**
     * Callback for when the user clicks the button to change their recovery key.
     */
    onChangingRecoveryKeyClick: MouseEventHandler<HTMLButtonElement>;
}

/**
 * This component allows the user to set up or change their recovery key.
 */
export function RecoveryPanel({ onSetUpRecoveryClick, onChangingRecoveryKeyClick }: RecoveryPanelProps): JSX.Element {
    const [state, setState] = useState<State>("loading");
    const isMissingBackup = state === "missing_backup";

    const matrixClient = useMatrixClientContext();

    const checkEncryption = useCallback(async () => {
        const crypto = matrixClient.getCrypto();
        if (!crypto) return;

        // Check if the user has a backup
        const hasBackup = Boolean(await crypto.getSessionBackupPrivateKey());
        if (!hasBackup) return setState("missing_backup");

        // Check if the secrets are cached
        const cachedSecrets = (await crypto.getCrossSigningStatus()).privateKeysCachedLocally;
        const secretsOk = cachedSecrets.masterKey && cachedSecrets.selfSigningKey && cachedSecrets.userSigningKey;
        if (!secretsOk) return setState("secrets_not_cached");

        setState("good");
    }, [matrixClient]);

    useEffect(() => {
        checkEncryption();
    }, [checkEncryption]);

    let content: JSX.Element;
    switch (state) {
        case "loading":
            content = <InlineSpinner />;
            break;
        case "missing_backup":
            content = (
                <Button size="sm" kind="primary" Icon={KeyIcon} onClick={onSetUpRecoveryClick}>
                    {_t("settings|encryption|recovery|set_up_recovery")}
                </Button>
            );
            break;
        case "secrets_not_cached":
            content = (
                <Button
                    size="sm"
                    kind="primary"
                    Icon={KeyIcon}
                    onClick={async () => await accessSecretStorage(checkEncryption)}
                >
                    {_t("settings|encryption|recovery|enter_recovery_key")}
                </Button>
            );
            break;
        default:
            content = (
                <Button size="sm" kind="secondary" Icon={KeyIcon} onClick={onChangingRecoveryKeyClick}>
                    {_t("settings|encryption|recovery|change_recovery_key")}
                </Button>
            );
    }

    return (
        <SettingsSection
            legacy={false}
            heading={
                <SettingsHeader hasRecommendedTag={isMissingBackup} label={_t("settings|encryption|recovery|title")} />
            }
            subHeading={<Subheader state={state} />}
        >
            {content}
        </SettingsSection>
    );
}

interface SubheaderProps {
    /**
     * The state of the recovery panel.
     */
    state: State;
}

/**
 * The subheader for the recovery panel.
 */
function Subheader({ state }: SubheaderProps): JSX.Element {
    // If we are in loading or if we have no backup, we only display a brief description
    if (state !== "secrets_not_cached") return <>{_t("settings|encryption|recovery|description")}</>;

    return (
        <SettingsSubheader
            label={_t("settings|encryption|recovery|description")}
            state="error"
            stateMessage={_t("settings|encryption|recovery|key_storage_warning")}
        />
    );
}
