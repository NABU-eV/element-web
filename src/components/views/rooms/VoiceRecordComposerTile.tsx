/*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import AccessibleTooltipButton from "../elements/AccessibleTooltipButton";
import { _t } from "../../../languageHandler";
import React, {ReactNode} from "react";
import {
    IRecordingUpdate,
    RECORDING_PLAYBACK_SAMPLES,
    RecordingState,
    VoiceRecording,
} from "../../../voice/VoiceRecording";
import {Room} from "matrix-js-sdk/src/models/room";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import classNames from "classnames";
import LiveRecordingWaveform from "../voice_messages/LiveRecordingWaveform";
import { replaceableComponent } from "../../../utils/replaceableComponent";
import { arrayFastResample, arraySeed } from "../../../utils/arrays";
import { percentageOf } from "../../../utils/numbers";
import LiveRecordingClock from "../voice_messages/LiveRecordingClock";
import { VoiceRecordingStore } from "../../../stores/VoiceRecordingStore";
import {UPDATE_EVENT} from "../../../stores/AsyncStore";
import RecordingPlayback from "../voice_messages/RecordingPlayback";
import { MsgType } from "matrix-js-sdk/src/@types/event";
import Modal from "../../../Modal";
import ErrorDialog from "../dialogs/ErrorDialog";
import CallMediaHandler from "../../../CallMediaHandler";

interface IProps {
    room: Room;
}

interface IState {
    recorder?: VoiceRecording;
    recordingPhase?: RecordingState;
    relHeights: number[];
    seconds: number;
}

/**
 * Container tile for rendering the voice message recorder in the composer.
 */
@replaceableComponent("views.rooms.VoiceRecordComposerTile")
export default class VoiceRecordComposerTile extends React.PureComponent<IProps, IState> {
    private waveform: number[] = [];
    private seconds = 0;
    private scheduledAnimationFrame = false;

    public constructor(props) {
        super(props);

        this.state = {
            recorder: null, // no recording started by default
            seconds: 0,
            relHeights: arraySeed(0, RECORDING_PLAYBACK_SAMPLES),
        };
    }

    public componentDidUpdate(prevProps, prevState) {
        if (!prevState.recorder && this.state.recorder) {
            this.state.recorder.liveData.onUpdate(this.onRecordingUpdate);
        }
    }

    public async componentWillUnmount() {
        await VoiceRecordingStore.instance.disposeRecording();
    }

    private onRecordingUpdate = (update: IRecordingUpdate): void => {
        this.waveform = update.waveform;
        this.seconds = update.timeSeconds;

        if (this.scheduledAnimationFrame) {
            return;
        }

        this.scheduledAnimationFrame = true;
        // The audio recorder flushes data faster than the screen refresh rate
        // Using requestAnimationFrame makes sure that we only flush the data
        // to react once per tick to avoid unneeded work.
        requestAnimationFrame(() => {
            // The waveform and the downsample target are pretty close, so we should be fine to
            // do this, despite the docs on arrayFastResample.
            const bars = arrayFastResample(Array.from(this.waveform), RECORDING_PLAYBACK_SAMPLES);
            this.setState({
                // The incoming data is between zero and one, but typically even screaming into a
                // microphone won't send you over 0.6, so we artificially adjust the gain for the
                // waveform. This results in a slightly more cinematic/animated waveform for the
                // user.
                relHeights: bars.map(b => percentageOf(b, 0, 0.50)),
                seconds: this.seconds,
            });
            this.scheduledAnimationFrame = false;
        });
    }

    // called by composer
    public async send() {
        if (!this.state.recorder) {
            throw new Error("No recording started - cannot send anything");
        }

        await this.state.recorder.stop();
        const mxc = await this.state.recorder.upload();
        MatrixClientPeg.get().sendMessage(this.props.room.roomId, {
            "body": "Voice message",
            //"msgtype": "org.matrix.msc2516.voice",
            "msgtype": MsgType.Audio,
            "url": mxc,
            "info": {
                duration: Math.round(this.state.recorder.durationSeconds * 1000),
                mimetype: this.state.recorder.contentType,
                size: this.state.recorder.contentLength,
            },

            // MSC1767 + Ideals of MSC2516 as MSC3245
            // https://github.com/matrix-org/matrix-doc/pull/3245
            "org.matrix.msc1767.text": "Voice message",
            "org.matrix.msc1767.file": {
                url: mxc,
                name: "Voice message.ogg",
                mimetype: this.state.recorder.contentType,
                size: this.state.recorder.contentLength,
            },
            "org.matrix.msc1767.audio": {
                duration: Math.round(this.state.recorder.durationSeconds * 1000),

                // https://github.com/matrix-org/matrix-doc/pull/3246
                waveform: this.state.recorder.getPlayback().waveform.map(v => Math.round(v * 1024)),
            },
            "org.matrix.msc3245.voice": {}, // No content, this is a rendering hint
        });
        await this.disposeRecording();
    }

    private async disposeRecording() {
        await VoiceRecordingStore.instance.disposeRecording();

        // Reset back to no recording, which means no phase (ie: restart component entirely)
        this.setState({recorder: null, recordingPhase: null});
    }

    private onCancel = async () => {
        await this.disposeRecording();
    };

    private onRecordStartEndClick = async () => {
        if (this.state.recorder) {
            await this.state.recorder.stop();
            return;
        }

        // The "microphone access error" dialogs are used a lot, so let's functionify them
        const accessError = () => {
            Modal.createTrackedDialog('Microphone Access Error', '', ErrorDialog, {
                title: _t("Unable to access your microphone"),
                description: <>
                    <p>{_t(
                        "We were unable to access your microphone. Please check your browser settings and try again.",
                    )}</p>
                </>,
            });
        };

        // Do a sanity test to ensure we're about to grab a valid microphone reference. Things might
        // change between this and recording, but at least we will have tried.
        try {
            const devices = await CallMediaHandler.getDevices();
            if (!devices?.['audioinput']?.length) {
                Modal.createTrackedDialog('No Microphone Error', '', ErrorDialog, {
                    title: _t("No microphone found"),
                    description: <>
                        <p>{_t(
                            "We didn't find a microphone on your device. Please check your settings and try again.",
                        )}</p>
                    </>,
                });
                return;
            }
            // else we probably have a device that is good enough
        } catch (e) {
            console.error("Error getting devices: ", e);
            accessError();
            return;
        }

        try {
            const recorder = VoiceRecordingStore.instance.startRecording();
            await recorder.start();

            // We don't need to remove the listener: the recorder will clean that up for us.
            recorder.on(UPDATE_EVENT, (ev: RecordingState) => {
                if (ev === RecordingState.EndingSoon) return; // ignore this state: it has no UI purpose here
                this.setState({recordingPhase: ev});
            });

            this.setState({recorder, recordingPhase: RecordingState.Started});
        } catch (e) {
            console.error("Error starting recording: ", e);
            accessError();

            // noinspection ES6MissingAwait - if this goes wrong we don't want it to affect the call stack
            VoiceRecordingStore.instance.disposeRecording();
        }
    };

    private renderWaveformArea(): ReactNode {
        if (!this.state.recorder) return null; // no recorder means we're not recording: no waveform

        if (this.state.recordingPhase !== RecordingState.Started) {
            // TODO: @@ TR: Should we disable this during upload? What does a failed upload look like?
            return <RecordingPlayback playback={this.state.recorder.getPlayback()} />;
        }

        // only other UI is the recording-in-progress UI
        return <div className="mx_VoiceMessagePrimaryContainer mx_VoiceRecordComposerTile_recording">
            <LiveRecordingClock seconds={this.state.seconds} />
            <LiveRecordingWaveform relHeights={this.state.relHeights} />
        </div>;
    }

    public render(): ReactNode {
        let recordingInfo;
        let deleteButton;
        if (!this.state.recordingPhase || this.state.recordingPhase === RecordingState.Started) {
            const classes = classNames({
                'mx_MessageComposer_button': !this.state.recorder,
                'mx_MessageComposer_voiceMessage': !this.state.recorder,
                'mx_VoiceRecordComposerTile_stop': this.state.recorder?.isRecording,
            });

            let tooltip = _t("Record a voice message");
            if (!!this.state.recorder) {
                tooltip = _t("Stop the recording");
            }

            let stopOrRecordBtn = <AccessibleTooltipButton
                className={classes}
                onClick={this.onRecordStartEndClick}
                title={tooltip}
            />;
            if (this.state.recorder && !this.state.recorder?.isRecording) {
                stopOrRecordBtn = null;
            }

            recordingInfo = stopOrRecordBtn;
        }

        if (this.state.recorder && this.state.recordingPhase !== RecordingState.Uploading) {
            deleteButton = <AccessibleTooltipButton
                className='mx_VoiceRecordComposerTile_delete'
                title={_t("Delete recording")}
                onClick={this.onCancel}
            />;
        }

        return (<>
            {deleteButton}
            {this.renderWaveformArea()}
            {recordingInfo}
        </>);
    }
}
