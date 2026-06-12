# ============================================================
#  증기와 비늘 스타일 LoRA 학습 (steamscale_style)
#  - base : SDXL 1.0 Base (ComfyUI 폴더 그대로 사용)
#  - GPU  : RTX 4070 12GB (1024 학습 여유 있음)
#  - 학습환경 : d:\kohya_ss (venv = Python 3.10)
#
#  실행법 (PowerShell):
#     d:\kohya_ss\venv\Scripts\Activate.ps1
#     d:\trpg\lora_dataset\train.ps1
#  끝나면 d:\trpg\lora_dataset\model\steamscale_style.safetensors 생성
# ============================================================

# 윈도우 콘솔 인코딩(cp949) 때문에 sd-scripts 일본어 로그 출력 시 크래시 방지
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

# --- 경로 (필요시만 수정) ---
$BASE   = "d:\ComfyUI_windows_portable\ComfyUI\models\checkpoints\sd_xl_base_1.0.safetensors"
$TRAIN  = "d:\trpg\lora_dataset\train"
$OUTDIR = "d:\trpg\lora_dataset\model"
$LOGDIR = "d:\trpg\lora_dataset\log"
$SCRIPT = "d:\kohya_ss\sd-scripts\sdxl_train_network.py"

accelerate launch --num_cpu_threads_per_process 4 $SCRIPT `
  --pretrained_model_name_or_path "$BASE" `
  --train_data_dir "$TRAIN" `
  --output_dir "$OUTDIR" `
  --logging_dir "$LOGDIR" `
  --output_name "steamscale_style" `
  --resolution "1024,1024" `
  --caption_extension ".txt" `
  --network_module networks.lora `
  --network_dim 32 --network_alpha 16 `
  --train_batch_size 2 `
  --max_train_epochs 8 `
  --learning_rate 1e-4 --unet_lr 1e-4 `
  --network_train_unet_only `
  --optimizer_type AdamW8bit `
  --lr_scheduler cosine --lr_warmup_steps 100 `
  --mixed_precision bf16 --save_precision bf16 `
  --cache_latents --cache_latents_to_disk `
  --cache_text_encoder_outputs --cache_text_encoder_outputs_to_disk `
  --gradient_checkpointing `
  --xformers `
  --no_half_vae `
  --save_model_as safetensors `
  --save_every_n_epochs 2 `
  --max_data_loader_n_workers 2 `
  --seed 42

# 메모:
# - 12GB라 batch 2 + 텍스트인코더 학습까지 켰음 (스타일 디테일 ↑).
# - OOM 나면: --train_batch_size 1, 그래도 안되면 --network_train_unet_only 추가.
# - 결과 .safetensors -> d:\ComfyUI_windows_portable\ComfyUI\models\loras\ 로 복사해서 사용.
