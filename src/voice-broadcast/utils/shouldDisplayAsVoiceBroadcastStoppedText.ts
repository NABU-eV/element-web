/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { MatrixEvent } from "matrix-js-sdk/src/matrix";

import { VoiceBroadcastInfoEventType, VoiceBroadcastInfoState } from "..";

export const shouldDisplayAsVoiceBroadcastStoppedText = (event: MatrixEvent): boolean =>
    event.getType() === VoiceBroadcastInfoEventType &&
    event.getContent()?.state === VoiceBroadcastInfoState.Stopped &&
    !event.isRedacted();