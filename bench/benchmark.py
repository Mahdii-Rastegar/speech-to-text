"""Local engine benchmark: faster-whisper and whisper.cpp on your own recordings.

Reads every audio file in bench/samples that has a reference text beside it
(same name, .txt), runs each engine configuration on it and writes accuracy
and speed to bench/results/. Samples, models and results stay out of git.

Usage:  python bench/benchmark.py [--only <substring of a config name>]
"""

from __future__ import annotations

import argparse
import gc
import importlib.util
import json
import os
import re
import subprocess
import sys
import threading
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "bench" / "samples"
RESULTS = ROOT / "bench" / "results"
WAVS = RESULTS / "wav"
MODELS = ROOT / "models"
WHISPER_CPP = ROOT / "bench" / "tools" / "whisper-cpp"

AUDIO_EXTENSIONS = {".m4a", ".mp3", ".wav", ".ogg", ".flac", ".webm", ".opus"}
CPU_THREADS = 6

# English terms a Persian speaker drops into technical talk. Given to the
# engine as an initial prompt in the "+prompt" configurations.
TERMS_PROMPT = "API, AI Agent, Deploy, discipline, high quality, prompt, model, backend, frontend."


# --------------------------------------------------------------------------
# Text scoring
# --------------------------------------------------------------------------

_ARABIC_TO_PERSIAN = str.maketrans(
    {
        "ي": "ی",
        "ى": "ی",
        "ئ": "ی",
        "ك": "ک",
        "ة": "ه",
        "ۀ": "ه",
        "أ": "ا",
        "إ": "ا",
        "ؤ": "و",
        "‌": " ",  # zero-width non-joiner: "می‌برم" and "می برم" count as equal
        "‍": "",
    }
)
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize(text: str) -> str:
    """Folds spelling variants that are not recognition errors."""
    text = unicodedata.normalize("NFC", text).lower()
    text = text.translate(_ARABIC_TO_PERSIAN).translate(_DIGITS)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = "".join(" " if unicodedata.category(ch)[0] in "PSZC" else ch for ch in text)
    return re.sub(r"\s+", " ", text).strip()


def edit_distance(a: list[str], b: list[str]) -> int:
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x != y)))
        previous = current
    return previous[-1]


def error_rates(reference: str, hypothesis: str) -> tuple[float, float]:
    """Word error rate and character error rate, both as fractions."""
    ref, hyp = normalize(reference), normalize(hypothesis)
    ref_words, hyp_words = ref.split(), hyp.split()
    ref_chars, hyp_chars = list(ref.replace(" ", "")), list(hyp.replace(" ", ""))
    wer = edit_distance(ref_words, hyp_words) / max(len(ref_words), 1)
    cer = edit_distance(ref_chars, hyp_chars) / max(len(ref_chars), 1)
    return wer, cer


# --------------------------------------------------------------------------
# Samples
# --------------------------------------------------------------------------


@dataclass
class Sample:
    name: str
    wav: Path
    reference: str
    language: str
    seconds: float


def guess_language(reference: str) -> str:
    persian = sum("؀" <= ch <= "ۿ" for ch in reference)
    return "fa" if persian > len(reference) * 0.2 else "en"


def load_samples() -> list[Sample]:
    WAVS.mkdir(parents=True, exist_ok=True)
    samples = []
    for audio in sorted(SAMPLES.iterdir()):
        if audio.suffix.lower() not in AUDIO_EXTENSIONS:
            continue
        text_file = audio.with_suffix(".txt")
        if not text_file.exists():
            print(f"skip {audio.name}: no reference text")
            continue
        reference = text_file.read_text(encoding="utf-8-sig").strip()
        wav = WAVS / (audio.stem + ".wav")
        if not wav.exists():
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(audio), "-ac", "1", "-ar", "16000",
                 "-c:a", "pcm_s16le", str(wav)],
                check=True,
            )
        seconds = (wav.stat().st_size - 44) / (16000 * 2)
        samples.append(Sample(audio.stem, wav, reference, guess_language(reference), seconds))
    return samples


# --------------------------------------------------------------------------
# GPU memory
# --------------------------------------------------------------------------


def gpu_memory_mb() -> int:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        ).stdout
        return int(out.strip().splitlines()[0])
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return 0


class GpuPeak:
    """Peak GPU memory above the level seen when the measurement started."""

    def __enter__(self) -> "GpuPeak":
        self.baseline = gpu_memory_mb()
        self.peak = self.baseline
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._poll, daemon=True)
        self._thread.start()
        return self

    def _poll(self) -> None:
        while not self._stop.wait(0.25):
            self.peak = max(self.peak, gpu_memory_mb())

    def __exit__(self, *_: object) -> None:
        self._stop.set()
        self._thread.join()

    @property
    def used(self) -> int:
        return max(self.peak - self.baseline, 0)


# --------------------------------------------------------------------------
# Engines
# --------------------------------------------------------------------------


@dataclass
class Config:
    name: str
    engine: str  # "faster-whisper" or "whisper.cpp"
    model: Path
    device: str  # "cuda" or "cpu"
    compute_type: str = ""
    beam: int = 5
    prompt: str = ""


def add_cuda_libraries() -> None:
    """CTranslate2 needs cuBLAS and cuDNN; the installed torch already ships them."""
    spec = importlib.util.find_spec("torch")
    if spec is None or spec.origin is None:
        return
    lib = Path(spec.origin).parent / "lib"
    if lib.is_dir():
        os.add_dll_directory(str(lib))
        os.environ["PATH"] = str(lib) + os.pathsep + os.environ["PATH"]


def run_faster_whisper(config: Config, samples: list[Sample]) -> list[dict]:
    from faster_whisper import WhisperModel

    with GpuPeak() as gpu:
        started = time.perf_counter()
        model = WhisperModel(
            str(config.model), device=config.device, compute_type=config.compute_type,
            cpu_threads=CPU_THREADS,
        )
        load_seconds = time.perf_counter() - started

        def transcribe(sample: Sample) -> tuple[str, float]:
            started = time.perf_counter()
            segments, _ = model.transcribe(
                str(sample.wav), language=sample.language, beam_size=config.beam,
                initial_prompt=config.prompt or None,
            )
            text = " ".join(segment.text.strip() for segment in segments)
            return text, time.perf_counter() - started

        transcribe(samples[0])  # warm-up, so the first sample is not penalised
        rows = []
        for sample in samples:
            text, seconds = transcribe(sample)
            rows.append({"sample": sample.name, "text": text, "seconds": seconds})
    del model
    gc.collect()  # frees the GPU memory before the next configuration loads
    for row in rows:
        row.update(load_seconds=load_seconds, gpu_mb=gpu.used)
    return rows


_TIMING = re.compile(r"whisper_print_timings:\s+(load|total) time =\s+([\d.]+) ms")


def run_whisper_cpp(config: Config, samples: list[Sample]) -> list[dict]:
    # Timestamps stay on: with -nt the decoder loses its place at the 30 s
    # window edge and drops whole sentences.
    cli = next(WHISPER_CPP.rglob("whisper-cli.exe"), None)
    if cli is None:
        raise FileNotFoundError(f"whisper-cli.exe not found under {WHISPER_CPP}")
    # The CUDA build needs cublas64_11.dll, which its release zip leaves out.
    # BENCH_CUDA_DLL_DIR points at a folder that has it.
    environment = dict(os.environ)
    extra = os.environ.get("BENCH_CUDA_DLL_DIR", "")
    if extra:
        environment["PATH"] = extra + os.pathsep + environment["PATH"]
    rows = []
    for sample in samples:
        out_base = RESULTS / "wav" / f"{sample.name}.{config.name.replace(' ', '_')}"
        command = [
            str(cli), "-m", str(config.model), "-f", str(sample.wav), "-l", sample.language,
            "-t", str(CPU_THREADS), "-bs", str(config.beam), "-bo", str(config.beam), "-otxt", "-of", str(out_base),
        ]
        if config.device == "cpu":
            command.append("-ng")
        if config.prompt:
            command += ["--prompt", config.prompt]
        with GpuPeak() as gpu:
            started = time.perf_counter()
            done = subprocess.run(command, capture_output=True, cwd=cli.parent, env=environment)
            wall = time.perf_counter() - started
        log = done.stderr.decode("utf-8", "replace") + done.stdout.decode("utf-8", "replace")
        if done.returncode != 0:
            raise RuntimeError(log[-800:])
        timings = {kind: float(ms) / 1000 for kind, ms in _TIMING.findall(log)}
        load = timings.get("load", 0.0)
        # The app keeps the model loaded, so the load time is reported apart.
        seconds = timings["total"] - load if "total" in timings else wall
        text_file = out_base.with_name(out_base.name + ".txt")
        text = " ".join(text_file.read_text(encoding="utf-8").split())
        text_file.unlink()
        rows.append({"sample": sample.name, "text": text, "seconds": seconds,
                     "load_seconds": load, "gpu_mb": gpu.used})
    return rows


def configs() -> list[Config]:
    turbo_ct2 = MODELS / "ct2" / "large-v3-turbo"
    turbo_ggml = MODELS / "ggml" / "ggml-large-v3-turbo-q5_0.bin"
    large_ggml = MODELS / "ggml" / "ggml-large-v3-q5_0.bin"
    return [
        Config("fw turbo gpu int8 beam5", "faster-whisper", turbo_ct2, "cuda", "int8_float32"),
        Config("fw turbo gpu int8 beam1", "faster-whisper", turbo_ct2, "cuda", "int8_float32", beam=1),
        Config("fw turbo gpu float32 beam5", "faster-whisper", turbo_ct2, "cuda", "float32"),
        Config("fw turbo gpu int8 beam5 +prompt", "faster-whisper", turbo_ct2, "cuda", "int8_float32",
               prompt=TERMS_PROMPT),
        Config("fw turbo cpu int8 beam5", "faster-whisper", turbo_ct2, "cpu", "int8"),
        Config("fw turbo cpu int8 beam1", "faster-whisper", turbo_ct2, "cpu", "int8", beam=1),
        Config("wcpp turbo-q5 gpu beam5", "whisper.cpp", turbo_ggml, "cuda"),
        Config("wcpp turbo-q5 gpu beam1", "whisper.cpp", turbo_ggml, "cuda", beam=1),
        Config("wcpp turbo-q5 gpu beam1 +prompt", "whisper.cpp", turbo_ggml, "cuda", beam=1,
               prompt=TERMS_PROMPT),
        Config("wcpp turbo-q5 cpu beam1", "whisper.cpp", turbo_ggml, "cpu", beam=1),
        Config("wcpp large-v3-q5 gpu beam5", "whisper.cpp", large_ggml, "cuda"),
        Config("wcpp large-v3-q5 gpu beam1", "whisper.cpp", large_ggml, "cuda", beam=1),
        Config("wcpp large-v3-q5 gpu beam1 +prompt", "whisper.cpp", large_ggml, "cuda", beam=1,
               prompt=TERMS_PROMPT),
    ]


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------


def write_report(samples: list[Sample], results: list[dict]) -> None:
    names = [sample.name for sample in samples]
    lines = [
        "# Local engine benchmark",
        "",
        "WER / CER in percent (lower is better). Speed is audio seconds per second of work",
        "(higher is better), with the model already loaded.",
        "",
        "| Configuration | " + " | ".join(f"{name} WER / CER" for name in names)
        + " | Mean WER | Speed | Load s | GPU MB |",
        "|---|" + "---|" * (len(names) + 4),
    ]
    for result in results:
        if "error" in result:
            lines.append(f"| {result['config']} | failed: {result['error'][:80]} |")
            continue
        rows = {row["sample"]: row for row in result["rows"]}
        cells = [f"{rows[n]['wer'] * 100:.1f} / {rows[n]['cer'] * 100:.1f}" for n in names]
        mean_wer = sum(rows[n]["wer"] for n in names) / len(names) * 100
        audio = sum(sample.seconds for sample in samples)
        work = sum(rows[n]["seconds"] for n in names)
        first = result["rows"][0]
        lines.append(
            f"| {result['config']} | " + " | ".join(cells)
            + f" | {mean_wer:.1f} | {audio / work:.1f}x | {first['load_seconds']:.1f} |"
            f" {max(row['gpu_mb'] for row in result['rows'])} |"
        )
    lines += ["", "## Transcripts", ""]
    for sample in samples:
        lines += [f"### {sample.name} ({sample.seconds:.0f} s, {sample.language})", "",
                  f"- **reference:** {sample.reference}"]
        for result in results:
            for row in result.get("rows", []):
                if row["sample"] == sample.name:
                    lines.append(f"- **{result['config']}:** {row['text']}")
        lines.append("")
    (RESULTS / "report.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="", help="run configurations whose name contains this")
    args = parser.parse_args()

    add_cuda_libraries()
    samples = load_samples()
    if not samples:
        sys.exit("no samples with a reference text in bench/samples")
    references = {sample.name: sample.reference for sample in samples}

    results_file = RESULTS / "results.json"
    previous = json.loads(results_file.read_text(encoding="utf-8")) if results_file.exists() else []
    by_name = {result["config"]: result for result in previous}

    for config in configs():
        if args.only and args.only not in config.name:
            continue
        if not config.model.exists():
            print(f"skip {config.name}: model not downloaded")
            continue
        print(f"run  {config.name} ...", flush=True)
        runner = run_faster_whisper if config.engine == "faster-whisper" else run_whisper_cpp
        try:
            rows = runner(config, samples)
        except Exception as error:  # one failing engine must not stop the others
            by_name[config.name] = {"config": config.name, "error": str(error)}
            print(f"     failed: {error}")
            continue
        for row in rows:
            row["wer"], row["cer"] = error_rates(references[row["sample"]], row["text"])
            print(f"     {row['sample']}: WER {row['wer'] * 100:.1f}%  {row['seconds']:.1f}s")
        by_name[config.name] = {"config": config.name, "rows": rows}

    order = [config.name for config in configs()]
    results = [by_name[name] for name in order if name in by_name]
    results_file.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    write_report(samples, results)
    print(f"report: {RESULTS / 'report.md'}")


if __name__ == "__main__":
    main()
