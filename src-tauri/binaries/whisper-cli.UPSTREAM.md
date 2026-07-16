# whisper.cpp Windows CPU bundle manifest

Pinned upstream asset (Windows x64 CPU):

- repository/tag: `ggml-org/whisper.cpp` `v1.8.3`
- URL: `https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip`
- archive SHA-256: `d824b1e37599f882b396e73f1ee0bfd5d0529f700314c48311dcbd00b803321d`
- `whisper-cli-x86_64-pc-windows-msvc.exe` SHA-256: `0ff971e410240a0b97117432d771245698f376e06105c011959d2bfc4bb23311`
- runtime DLL SHA-256: `ggml-base.dll` `61c9c57f49f380896ed54ed3f71735e10a2d986f482c2b0a55e72b47f731b193`; `ggml-cpu.dll` `eb2f1d023e51c40b27463b5ab165600eb48cb60323740f400b1b62e1c8706c56`; `ggml.dll` `bcfeaf6e5b59c315fc36e290715aa7a84b22461e968543c13dfcf57df7b1b81d`; `whisper.dll` `4037a6567fbb08fc7efda18e4d128a95df9c31ba171af20439d1a93b785d007e`

No downloaded executable was launched during packaging preparation.

`whisper.cpp` is distributed under the MIT License. Its license text and the
completed version/hash attribution must be included in `THIRD_PARTY_NOTICES.md`
for the released installer.

## Optional app-data CUDA component

The application may download this separate official Windows x64 CUDA asset only
after an explicit user action in Settings:

- repository/tag: `ggml-org/whisper.cpp` `v1.8.3`
- archive: `whisper-cublas-12.4.0-bin-x64.zip`
- URL: `https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-cublas-12.4.0-bin-x64.zip`
- archive SHA-256: `c12a563333d3c3707be70754dc0e87c1cb58aa6333a87055bbcf9b524488dfb0`

The CUDA archive is not bundled with the application. After verification it is
stored under the application's data directory at
`runtime/whisper.cpp/cuda/v1.8.3`. It is never installed into Windows system
directories, and it does not require Python or a system CUDA Toolkit. The
bundled CPU asset above remains the fallback runtime.
