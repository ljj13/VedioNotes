# Third-party notices

## BiliNote

This product's workbench design was informed by [JefferyHcool/BiliNote](https://github.com/JefferyHcool/BiliNote), reviewed at shallow reference commit `6d67e5a76a2c8da1dd73067943d39021ed137c26` (2026-06-23).

BiliNote is licensed under the MIT License, Copyright © 2024 Jeffery Huang. Its repository was used as read-only reference material; no BiliNote runtime or source code was copied into this project.

The applicable license text and source are available in the [BiliNote repository](https://github.com/JefferyHcool/BiliNote).

# whisper.cpp

This application bundles the Windows x64 CPU `whisper-cli` executable and
runtime DLLs from `ggml-org/whisper.cpp` **v1.8.3**: upstream asset
`whisper-bin-x64.zip`, sidecar `whisper-cli-x86_64-pc-windows-msvc.exe`, and
`ggml-base.dll`, `ggml-cpu.dll`, `ggml.dll`, and `whisper.dll`. whisper.cpp is
licensed under the MIT License. The exact pinned source URL and SHA-256 values
are recorded in `src-tauri/binaries/whisper-cli.UPSTREAM.md`.

Copyright (c) 2023 Georgi Gerganov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## sherpa-onnx

SenseVoice CPU transcription uses the optional Windows x64 `sherpa-onnx` non-streaming ASR executable. The application does not bundle this runtime in source control or in the base application: it is downloaded only after the user explicitly selects the CPU component in Settings. The production manifest pins runtime version `v1.13.2`, the official GitHub release URL, expected byte length and SHA-256 in `src-tauri/src/sensevoice_models.rs`.

sherpa-onnx is provided by the k2-fsa project under the Apache License 2.0. Upstream source and license: [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) and [Apache-2.0 license text](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE).

## SenseVoice model assets

CPU transcription optionally downloads SenseVoice-compatible ONNX model files and `tokens.txt` from the pinned Hugging Face repository, with a ModelScope mirror used only after the primary model request fails. The int8 and float32 model URLs, tokens URLs, expected lengths and digests are fixed in `src-tauri/src/sensevoice_models.rs`; the assets are not bundled and are obtained only by an explicit user action.

The upstream SenseVoice source project is published by FunAudioLLM under the MIT License. The referenced model repository identifies the weights under the FunASR Model License 1.0. Users should review the applicable upstream model card and license before downloading or redistributing model assets:

- [FunAudioLLM/SenseVoice](https://github.com/FunAudioLLM/SenseVoice)
- [SenseVoice source license](https://github.com/FunAudioLLM/SenseVoice/blob/main/LICENSE)
- [Pinned sherpa-onnx SenseVoice model repository](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17)
- [FunASR Model License 1.0](https://www.modelscope.cn/models/iic/SenseVoiceSmall/file/view/master?fileName=LICENSE)

## CipherTalk models.dev catalog snapshot (optional AI provider catalog data)

The derived file `src-tauri/assets/models-dev-standard.json` was generated offline from the bundled catalog snapshot at `CipherTalk/electron/assets/models-dev.json` in the locally reviewed CipherTalk source tree.

- CipherTalk project: `ILoveBingLu/CipherTalk`
- CipherTalk license: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
- Reviewed source snapshot SHA-256: `3050E7FD25D6CB1C5E9E067C7AC9224DE123DB9899ABAB7E8377843EC8887F92`
- Derived scope: 116 providers using OpenAI Compatible, OpenAI Responses, Anthropic, or Google protocols; 3,926 associated model records
- Transformation: deterministic filtering, base-URL normalization, and summary-eligibility annotation; no network fetch is performed by the generator or normal application startup

Provider names, model identifiers, capability metadata, documentation URLs, and pricing metadata remain attributable to their respective upstream providers and the models.dev data source. Inclusion in the catalog does not imply endorsement or bundled access credentials. Users remain responsible for provider terms, account eligibility, and API charges.