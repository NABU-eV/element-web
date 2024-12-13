/*
 * Copyright 2024 New Vector Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
 * Please see LICENSE files in the repository root for full details.
 */

import React from "react";
import { MatrixClient } from "matrix-js-sdk/src/matrix";
import { render, screen } from "jest-matrix-react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { mocked } from "jest-mock";

import { createTestClient, withClientContextRenderOptions } from "../../../../../test-utils";
import { RecoveryPanel } from "../../../../../../src/components/views/settings/encryption/RecoveryPanel";
import { accessSecretStorage } from "../../../../../../src/SecurityManager";

jest.mock("../../../../../../src/SecurityManager", () => ({
    accessSecretStorage: jest.fn(),
}));

describe("<RecoverPanel />", () => {
    let matrixClient: MatrixClient;

    beforeEach(() => {
        matrixClient = createTestClient();
        mocked(accessSecretStorage).mockClear().mockResolvedValue();
    });

    function renderRecoverPanel(
        props = {
            onSetUpRecoveryClick: jest.fn(),
            onChangingRecoveryKeyClick: jest.fn(),
        },
    ) {
        return render(<RecoveryPanel {...props} />, withClientContextRenderOptions(matrixClient));
    }

    it("should be in loading state when checking backup and the cached keys", () => {
        jest.spyOn(matrixClient.getCrypto()!, "getSessionBackupPrivateKey").mockImplementation(
            () => new Promise(() => {}),
        );

        const { asFragment } = renderRecoverPanel();
        expect(screen.getByLabelText("Loading…")).toBeInTheDocument();
        expect(asFragment()).toMatchSnapshot();
    });

    it("should ask to set up a recovery key when there is no key backup", async () => {
        const user = userEvent.setup();

        const onSetUpRecoveryClick = jest.fn();
        const { asFragment } = renderRecoverPanel({ onSetUpRecoveryClick, onChangingRecoveryKeyClick: jest.fn() });

        await waitFor(() => screen.getByRole("button", { name: "Set up recovery" }));
        expect(asFragment()).toMatchSnapshot();

        await user.click(screen.getByRole("button", { name: "Set up recovery" }));
        expect(onSetUpRecoveryClick).toHaveBeenCalled();
    });

    it("should ask to enter the recovery key when secrets are not cached", async () => {
        jest.spyOn(matrixClient.getCrypto()!, "getSessionBackupPrivateKey").mockResolvedValue(new Uint8Array(32));
        const user = userEvent.setup();
        const { asFragment } = renderRecoverPanel();

        await waitFor(() => screen.getByRole("button", { name: "Enter recovery key" }));
        expect(asFragment()).toMatchSnapshot();

        await user.click(screen.getByRole("button", { name: "Enter recovery key" }));
        expect(accessSecretStorage).toHaveBeenCalled();
    });

    it("should allow to change the recovery key when everything is good", async () => {
        jest.spyOn(matrixClient.getCrypto()!, "getSessionBackupPrivateKey").mockResolvedValue(new Uint8Array(32));
        jest.spyOn(matrixClient.getCrypto()!, "getCrossSigningStatus").mockResolvedValue({
            privateKeysInSecretStorage: true,
            publicKeysOnDevice: true,
            privateKeysCachedLocally: {
                masterKey: true,
                selfSigningKey: true,
                userSigningKey: true,
            },
        });
        const user = userEvent.setup();

        const onChangingRecoveryKeyClick = jest.fn();
        const { asFragment } = renderRecoverPanel({ onSetUpRecoveryClick: jest.fn(), onChangingRecoveryKeyClick });
        await waitFor(() => screen.getByRole("button", { name: "Change recovery key" }));
        expect(asFragment()).toMatchSnapshot();

        await user.click(screen.getByRole("button", { name: "Change recovery key" }));
        expect(onChangingRecoveryKeyClick).toHaveBeenCalled();
    });
});
