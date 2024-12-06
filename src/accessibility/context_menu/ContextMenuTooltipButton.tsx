/*
Copyright 2024 New Vector Ltd.
Copyright 2019 The Matrix.org Foundation C.I.C.
Copyright 2018 New Vector Ltd
Copyright 2015, 2016 OpenMarket Ltd

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { ComponentProps, forwardRef, Ref, type JSX } from "react";

import AccessibleButton from "../../components/views/elements/AccessibleButton";

type Props<T extends keyof JSX.IntrinsicElements> = ComponentProps<typeof AccessibleButton<T>> & {
    // whether the context menu is currently open
    isExpanded: boolean;
};

// Semantic component for representing the AccessibleButton which launches a <ContextMenu />
export const ContextMenuTooltipButton = forwardRef(function <T extends keyof JSX.IntrinsicElements>(
    { isExpanded, children, onClick, onContextMenu, element, ...props }: Props<T>,
    ref: Ref<HTMLElement>,
) {
    return (
        <AccessibleButton
            {...props}
            element={element as keyof JSX.IntrinsicElements}
            onClick={onClick}
            onContextMenu={onContextMenu ?? onClick ?? undefined}
            aria-haspopup={true}
            aria-expanded={isExpanded}
            disableTooltip={isExpanded}
            ref={ref}
        >
            {children}
        </AccessibleButton>
    );
});
