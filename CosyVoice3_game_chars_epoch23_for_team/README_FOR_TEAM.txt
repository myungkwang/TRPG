CosyVoice3 game character TTS model package

Best checkpoint basis: epoch_23_whole.pt had the lowest CV validation loss.

Use this model directory in CosyVoice:
  eval_model

Speaker IDs:
  char_doctor
  char_gail
  char_gm
  char_kargas
  char_marta
  char_miner
  char_nurse
  char_rin
  char_tavern_clerk
  char_toby

Included files:
  eval_model/          Full runnable Fun-CosyVoice3-0.5B model folder with fine-tuned flow.pt and spk2info.pt
  summary.json         Evaluation summary for epoch_23
  metrics.csv          Per-sample evaluation metrics
  EVALUATION_METRICS.md Metric descriptions and references

Do not replace eval_model/flow.pt with epoch_23_whole.pt directly; epoch_23_whole.pt contains training metadata.
