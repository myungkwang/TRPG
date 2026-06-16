from __future__ import annotations

import argparse
import json
import random
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TEXT = (
    "영석 등불이 희미하게 깜빡이는 진료소. 당신은 기억을 잃은 채 눈을 뜬다. "
    "의사가 낮은 목소리로 묻는다. 깨어났군요. 당신이 누군지 기억나는 게 있습니까?"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark CosyVoice stream=False vs stream=True with the current TRPG server settings.",
    )
    parser.add_argument("--text", default=DEFAULT_TEXT, help="Text to synthesize.")
    parser.add_argument("--text-file", type=Path, help="UTF-8 text file to synthesize instead of --text.")
    parser.add_argument("--speaker", default="gm", help="Speaker key, for example gm, doctor, lin, gail, tobi.")
    parser.add_argument("--repeat", type=int, default=1, help="Measured repeats per mode.")
    parser.add_argument("--warmup", type=int, default=0, help="Warmup repeats per mode, excluded from summary.")
    parser.add_argument(
        "--mode",
        choices=("both", "stream", "nonstream"),
        default="both",
        help="Which mode to benchmark.",
    )
    parser.add_argument("--save-audio", action="store_true", help="Save generated wav files for listening checks.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=PROJECT_ROOT / "tools" / "tts_benchmark_out",
        help="Directory for JSON and optional wav outputs.",
    )
    parser.add_argument("--json-out", type=Path, help="Explicit JSON output path.")
    return parser.parse_args()


def import_server_module():
    sys.path.insert(0, str(PROJECT_ROOT))
    import server  # noqa: PLC0415

    return server


def sync_cuda(torch_module: Any) -> None:
    if torch_module.cuda.is_available():
        torch_module.cuda.synchronize()


def seed_everything(server: Any, torch_module: Any, numpy_module: Any) -> None:
    random.seed(server.COSYVOICE_SEED)
    numpy_module.random.seed(server.COSYVOICE_SEED)
    torch_module.manual_seed(server.COSYVOICE_SEED)
    if torch_module.cuda.is_available():
        torch_module.cuda.manual_seed_all(server.COSYVOICE_SEED)


def read_text(args: argparse.Namespace) -> str:
    if args.text_file:
        return args.text_file.read_text(encoding="utf-8").strip()
    return str(args.text or "").strip()


def ensure_endofprompt(value: str) -> str:
    return value if "<|endofprompt|>" in value else f"{value}<|endofprompt|>"


def build_model_inputs(server: Any, model: Any, text: str, speaker: str) -> list[dict[str, Any]]:
    if server.COSYVOICE_MODE == "instruct":
        instruction = ensure_endofprompt(server.COSYVOICE_DEFAULT_INSTRUCTION.strip())
        normalized_instruction = model.frontend.text_normalize(
            instruction,
            split=False,
            text_frontend=server.COSYVOICE_TEXT_FRONTEND,
        )
        segments = model.frontend.text_normalize(
            text,
            split=True,
            text_frontend=server.COSYVOICE_TEXT_FRONTEND,
        )
        return [
            {
                "segment_index": index,
                "segment_text": segment,
                "input": model.frontend.frontend_instruct(segment, speaker, normalized_instruction),
            }
            for index, segment in enumerate(segments)
        ]

    if server.COSYVOICE_MODE != "sft":
        raise RuntimeError(f"Unsupported COSYVOICE_MODE for this benchmark: {server.COSYVOICE_MODE}")

    prompt_text = ensure_endofprompt(server.COSYVOICE_SFT_INSTRUCTION)
    prompt_text_token, prompt_text_token_len = model.frontend._extract_text_token(prompt_text)
    segments = model.frontend.text_normalize(
        text,
        split=True,
        text_frontend=server.COSYVOICE_TEXT_FRONTEND,
    )

    model_inputs = []
    for index, segment in enumerate(segments):
        model_input = model.frontend.frontend_sft(segment, speaker)
        model_input["prompt_text"] = prompt_text_token
        model_input["prompt_text_len"] = prompt_text_token_len
        model_inputs.append({
            "segment_index": index,
            "segment_text": segment,
            "input": model_input,
        })
    return model_inputs


def tensor_to_audio_chunk(torch_module: Any, chunk: Any) -> Any:
    speech = chunk["tts_speech"].detach().cpu()
    if speech.dim() == 1:
        speech = speech.unsqueeze(0)
    return speech


def save_audio(path: Path, audio: Any, sample_rate: int) -> None:
    import soundfile as sf  # noqa: PLC0415

    audio_np = audio.detach().cpu().float().clamp(-1.0, 1.0).numpy()
    if audio_np.ndim == 2:
        audio_np = audio_np.T
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio_np, sample_rate, subtype="PCM_16")


def summarize_chunks(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    if not chunks:
        return {
            "chunk_count": 0,
            "first_chunk_sec": None,
            "audio_duration_sec": 0.0,
            "min_chunk_audio_sec": None,
            "max_chunk_audio_sec": None,
        }
    durations = [chunk["audio_sec"] for chunk in chunks]
    return {
        "chunk_count": len(chunks),
        "first_chunk_sec": chunks[0]["wall_sec"],
        "audio_duration_sec": sum(durations),
        "min_chunk_audio_sec": min(durations),
        "max_chunk_audio_sec": max(durations),
    }


def run_once(
    *,
    server: Any,
    torch_module: Any,
    numpy_module: Any,
    model: Any,
    text: str,
    speaker: str,
    stream: bool,
    run_label: str,
    output_dir: Path,
    save_wav: bool,
    initial_token_hop_len: int | None,
) -> dict[str, Any]:
    if initial_token_hop_len is not None and hasattr(model.model, "token_hop_len"):
        model.model.token_hop_len = initial_token_hop_len

    seed_everything(server, torch_module, numpy_module)
    model_inputs = build_model_inputs(server, model, text, speaker)
    sample_rate = int(getattr(model, "sample_rate", 24000))
    chunks = []
    audio_tensors = []

    sync_cuda(torch_module)
    total_start = time.perf_counter()

    with server.cosyvoice_lock:
        for model_input_info in model_inputs:
            segment_start = time.perf_counter()
            generator = model.model.tts(
                **model_input_info["input"],
                stream=stream,
                speed=server.COSYVOICE_SPEED,
            )
            for local_chunk_index, chunk in enumerate(generator):
                sync_cuda(torch_module)
                now = time.perf_counter()
                speech = tensor_to_audio_chunk(torch_module, chunk)
                samples = int(speech.shape[-1])
                audio_sec = samples / sample_rate
                audio_tensors.append(speech)
                chunks.append({
                    "global_chunk_index": len(chunks),
                    "segment_index": model_input_info["segment_index"],
                    "segment_text": model_input_info["segment_text"],
                    "segment_wall_sec": now - segment_start,
                    "wall_sec": now - total_start,
                    "local_chunk_index": local_chunk_index,
                    "samples": samples,
                    "audio_sec": audio_sec,
                })

    sync_cuda(torch_module)
    total_sec = time.perf_counter() - total_start
    chunk_summary = summarize_chunks(chunks)
    rtf = total_sec / chunk_summary["audio_duration_sec"] if chunk_summary["audio_duration_sec"] else None

    wav_path = None
    if save_wav and audio_tensors:
        audio = torch_module.cat(audio_tensors, dim=-1)
        wav_path = output_dir / f"{run_label}.wav"
        save_audio(wav_path, audio, sample_rate)

    return {
        "label": run_label,
        "stream": stream,
        "total_sec": total_sec,
        "rtf": rtf,
        "sample_rate": sample_rate,
        "normalized_segments": [item["segment_text"] for item in model_inputs],
        "wav_path": str(wav_path) if wav_path else None,
        **chunk_summary,
        "chunks": chunks,
    }


def average(values: list[float | None]) -> float | None:
    numeric = [value for value in values if value is not None]
    return sum(numeric) / len(numeric) if numeric else None


def print_run_summary(result: dict[str, Any]) -> None:
    print(
        f"{result['label']}: "
        f"stream={result['stream']} "
        f"first_chunk={result['first_chunk_sec']:.3f}s "
        f"total={result['total_sec']:.3f}s "
        f"audio={result['audio_duration_sec']:.3f}s "
        f"chunks={result['chunk_count']} "
        f"rtf={result['rtf']:.3f}"
    )


def main() -> int:
    args = parse_args()
    text = read_text(args)
    if not text:
        raise SystemExit("Text is empty.")

    server = import_server_module()
    import numpy as np  # noqa: PLC0415
    import torch  # noqa: PLC0415

    req = server.TTSRequest(text=text, speaker=args.speaker)
    resolved_speaker = server._cosyvoice_speaker(req)
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading CosyVoice model...")
    load_start = time.perf_counter()
    model = server.get_cosyvoice_client()
    sync_cuda(torch)
    model_load_sec = time.perf_counter() - load_start

    initial_token_hop_len = getattr(model.model, "token_hop_len", None)
    modes = []
    if args.mode in {"both", "nonstream"}:
        modes.append(False)
    if args.mode in {"both", "stream"}:
        modes.append(True)

    metadata = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "project_root": str(PROJECT_ROOT),
        "text": text,
        "text_chars": len(text),
        "requested_speaker": args.speaker,
        "resolved_speaker": resolved_speaker,
        "cosyvoice_model_dir": str(server.COSYVOICE_MODEL_DIR),
        "cosyvoice_mode": server.COSYVOICE_MODE,
        "cosyvoice_llm_file": server.COSYVOICE_LLM_FILE,
        "cosyvoice_speed": server.COSYVOICE_SPEED,
        "cosyvoice_fp16_env": server.os.getenv("COSYVOICE_FP16"),
        "torch_version": torch.__version__,
        "torch_cuda": torch.cuda.is_available(),
        "torch_cuda_version": torch.version.cuda,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "model_load_sec": model_load_sec,
        "repeat": args.repeat,
        "warmup": args.warmup,
    }

    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    if server.COSYVOICE_SPEED != 1.0:
        print("WARNING: CosyVoice stream mode is safest with COSYVOICE_SPEED=1.0.")

    all_results = []
    measured_results = []
    for stream in modes:
        mode_name = "stream" if stream else "nonstream"
        for warm_index in range(max(0, args.warmup)):
            label = f"warmup_{mode_name}_{warm_index + 1}"
            result = run_once(
                server=server,
                torch_module=torch,
                numpy_module=np,
                model=model,
                text=text,
                speaker=resolved_speaker,
                stream=stream,
                run_label=label,
                output_dir=output_dir,
                save_wav=False,
                initial_token_hop_len=initial_token_hop_len,
            )
            print_run_summary(result)
            all_results.append({**result, "warmup": True})

        for repeat_index in range(max(1, args.repeat)):
            label = f"{mode_name}_{repeat_index + 1}"
            result = run_once(
                server=server,
                torch_module=torch,
                numpy_module=np,
                model=model,
                text=text,
                speaker=resolved_speaker,
                stream=stream,
                run_label=label,
                output_dir=output_dir,
                save_wav=args.save_audio,
                initial_token_hop_len=initial_token_hop_len,
            )
            print_run_summary(result)
            all_results.append({**result, "warmup": False})
            measured_results.append(result)

    by_mode = {}
    for stream in modes:
        key = "stream" if stream else "nonstream"
        mode_results = [result for result in measured_results if result["stream"] is stream]
        by_mode[key] = {
            "runs": len(mode_results),
            "avg_first_chunk_sec": average([result["first_chunk_sec"] for result in mode_results]),
            "avg_total_sec": average([result["total_sec"] for result in mode_results]),
            "avg_audio_duration_sec": average([result["audio_duration_sec"] for result in mode_results]),
            "avg_rtf": average([result["rtf"] for result in mode_results]),
            "avg_chunk_count": average([float(result["chunk_count"]) for result in mode_results]),
        }

    comparison = {}
    if "stream" in by_mode and "nonstream" in by_mode:
        non_first = by_mode["nonstream"]["avg_first_chunk_sec"]
        stream_first = by_mode["stream"]["avg_first_chunk_sec"]
        non_total = by_mode["nonstream"]["avg_total_sec"]
        stream_total = by_mode["stream"]["avg_total_sec"]
        comparison = {
            "first_chunk_saved_sec": (non_first - stream_first) if non_first is not None and stream_first is not None else None,
            "total_delta_sec": (stream_total - non_total) if non_total is not None and stream_total is not None else None,
        }

    report = {
        "metadata": metadata,
        "summary": by_mode,
        "comparison": comparison,
        "results": all_results,
    }

    json_out = args.json_out or output_dir / f"cosyvoice_stream_benchmark_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    json_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\nSummary:")
    print(json.dumps({"summary": by_mode, "comparison": comparison, "json_out": str(json_out)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
