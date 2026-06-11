# CosyVoice Fine-Tune Evaluation Metrics

This project reports automatic metrics after synthesizing held-out dev text with the fine-tuned checkpoint.

## Core Metrics

- `speaker_cosine`: speaker embedding cosine similarity between reference wav and generated wav. Higher is better. This is the main automatic proxy for whether the generated voice stayed close to the target speaker.
- `mcd_db`: MFCC-based mel-cepstral distortion with DTW alignment. Lower is better. This is a proxy for spectral/acoustic distance.
- `f0_rmse_hz`, `f0_corr`, `f0_median_delta_hz`: pitch/prosody similarity. Lower RMSE, higher correlation, and smaller median delta are better.
- `duration_error_ratio`: speaking-rate/duration match. Lower is better.
- `rtf`: real-time factor, measured as synthesis time divided by generated audio duration. Lower is faster; below 1.0 means faster than real time.
- `pesq_wb`, `stoi`: optional full-reference quality/intelligibility metrics. They are emitted only if `pesq` and `pystoi` are installed.
- `cer`, `wer`: optional ASR intelligibility proxies. They are emitted only when `--enable-asr` succeeds.

## Human Evaluation

MOS/naturalness is still the most important final check, but it is a human listening test, not a reliable pure-code metric. Use these automatic metrics to catch regressions before a small listening test.

## References Used

- ONNX Runtime CUDA Execution Provider: https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- TTS evaluation using MOS/WER-style proxy metrics: https://arxiv.org/abs/2310.00706
- Automatic speaker similarity evaluation: https://arxiv.org/abs/2207.00344
- TTS fine-tuning evaluation with MOSNet, speaker cosine similarity, and WER: https://arxiv.org/abs/2203.11562
- STOI/intelligibility metric background: https://arxiv.org/abs/1802.00604
