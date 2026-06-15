CosyVoice3 game character TTS model package

Current runtime checkpoint: game_chars_12h best flow checkpoint.
Best checkpoint basis: game_chars_12h epoch_35_whole.pt selected by the automatic scoreboard.
Original epoch23 flow checkpoint is kept locally as eval_model/flow.epoch23_backup_*.pt when available.

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
  char_lin
  char_tavern_clerk
  char_tobi

Included files:
  eval_model/          Full runnable Fun-CosyVoice3-0.5B model folder with 12h-best fine-tuned flow.pt and spk2info.pt
  best_checkpoint.json Best-checkpoint selection metadata
  summary.json         Evaluation summary for the 12h-best checkpoint
  metrics.csv          Per-sample evaluation metrics for the 12h-best checkpoint
  EVALUATION_METRICS.md Metric descriptions and references

Do not replace eval_model/flow.pt with epoch_*_whole.pt directly unless the packaging script converts it for runtime use.
