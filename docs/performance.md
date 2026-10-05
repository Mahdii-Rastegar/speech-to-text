# Performance

Measured on 2026-10-05 on the development laptop: Intel Xeon E-2176M (6 cores, 12 threads), 32 GB RAM, NVIDIA Quadro P2000 Max-Q (4 GB, Pascal generation), Windows 10. The graphics card is an old, small one; anything newer will be faster. The CPU figures are what a computer without an NVIDIA card can expect.

The recordings are three clips of one speaker, 33 to 41 seconds each: Persian, English, and Persian with English terms. That is enough to compare settings, not enough to promise an error rate.

## Local engine

whisper.cpp with `large-v3-turbo` (q5_0), started with the flags the app uses.

|                                    | GPU                    | CPU (6 threads) |
| ---------------------------------- | ---------------------- | --------------- |
| Model ready after start            | 1.9 s                  | 0.8 s           |
| 34 s of Persian                    | 3.6 s (9.4x real time) | 53 s (0.6x)     |
| 41 s of English                    | 3.1 s (13x)            | 51 s (0.8x)     |
| 33 s of Persian with English terms | 3.6 s (9.2x)           | 64 s (0.5x)     |
| A 6 s sentence, language set       | 1.4 to 1.5 s           | 25 to 28 s      |
| A 6 s sentence, language `auto`    | 2.8 s                  | 50 s            |

Three things follow from the table.

- **A short clip costs as much as a 30-second one.** Whisper always works through a full 30-second window, so the time per request does not shrink with the clip. Live text sends one request per sentence, which is why the delay behind the speaker is about one request: a second or two on this GPU, half a minute on its CPU. On the CPU the app therefore shows finished sentences only, without the interim text.
- **`auto` doubles the time**, because the engine listens once to find the language and once to transcribe. Choosing Persian or English in Settings halves the wait.
- **Without a GPU the local engine is slower than speech.** It still works for files and for dictation that is read afterwards. For live text on such a computer a cloud engine is the better choice.

With the model loaded the engine process holds about 420 MB of RAM, and about 890 MB of graphics memory when it runs on the GPU.

## Accuracy

Word error rate on the same three clips, from the benchmark that chose the engine (`bench/benchmark.py`, greedy decoding on the GPU):

|                            | Without glossary | With glossary |
| -------------------------- | ---------------- | ------------- |
| English                    | 4.0%             | 4.0%          |
| Persian                    | 9.5%             | 9.5%          |
| Persian with English terms | 24.7%            | 8.2%          |

The glossary is the list of names and English terms in Settings; it is handed to the engine as a spelling hint. Without it English words in a Persian sentence come out in Persian letters ("ای پی آی" for "API"), which is most of that 24.7%.

The `small` model runs at about real-time speed on the CPU but is poor at Persian, which is why the larger model is the recommended one on every computer.

## Desktop app

|                                               |                                                               |
| --------------------------------------------- | ------------------------------------------------------------- |
| Executable                                    | 13.8 MB                                                       |
| Portable folder without a model               | 24 MB                                                         |
| Recommended model                             | 574 MB                                                        |
| Optional GPU pack                             | 953 MB                                                        |
| Start to a usable window                      | 1.3 s                                                         |
| Memory, idle                                  | 34 MB for the app, about 500 MB across the WebView2 processes |
| A 34 s file from choosing it to finished text | 10.4 s, loading the model included (GPU, language `auto`)     |

The WebView2 figure is the sum of the working sets of its processes, which counts shared memory more than once; the real cost is lower.

## Web app

|            |                                          |
| ---------- | ---------------------------------------- |
| Whole site | 773 kB                                   |
| JavaScript | 452 kB (140 kB compressed)               |
| Styles     | 50 kB (13 kB compressed)                 |
| Fonts      | 187 kB, loaded by script range as needed |

After the first visit the service worker serves all of it from the device, so the installed app starts without a connection. Transcription speed there is the cloud service's own.

## Reproducing

`python bench/benchmark.py` compares engines and models on recordings placed in `bench/samples` (not in the repository). The speed table above came from sending the same clips to `whisper-server.exe` over HTTP and timing the answers.
