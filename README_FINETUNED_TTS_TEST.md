# Fine-tuned CosyVoice3 Test

## Required Model Folder

The fine-tuned model is not included in this code folder. Put the model package here:

```text
trpg\CosyVoice3_game_chars_epoch23_for_team\eval_model
```

This also works if the model package is next to the project folder:

```text
Desktop\trpg
Desktop\CosyVoice3_game_chars_epoch23_for_team\eval_model
```

The `eval_model` folder must contain files such as:

```text
cosyvoice3.yaml
flow.pt
llm.pt
hift.pt
spk2info.pt
speech_tokenizer_v3.onnx
campplus.onnx
CosyVoice-BlankEN\
```

Alternatively, set this in `.env`:

```text
COSYVOICE_MODEL_DIR=C:\absolute\path\to\eval_model
TTS_PROVIDER=cosyvoice
```

## Run Standalone Test UI

Double-click:

```text
run_finetuned_tts_test.cmd
```

Then open:

```text
http://127.0.0.1:8023
```

## Speaker IDs

- `char_doctor`
- `char_gail`
- `char_gm`
- `char_kargas`
- `char_marta`
- `char_miner`
- `char_nurse`
- `char_lin`
- `char_tavern_clerk`
- `char_tobi`

## Common Problems

- If the model folder is missing, startup fails with `Fine-tuned model folder not found`.
- If dependencies are missing, install project requirements in the Python environment used by `run_finetuned_tts_test.cmd`.
- If the game server still uses Edge TTS, check that `.env` has `TTS_PROVIDER=cosyvoice`.
