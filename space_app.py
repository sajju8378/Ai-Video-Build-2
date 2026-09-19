import os; os.system('pip install --upgrade --no-deps spaces')
import spaces
import shutil
import subprocess
import sys
import copy
import random
import tempfile
import warnings
import time
import gc
import uuid
import threading
from tqdm import tqdm
import cv2
import numpy as np
import torch
import torch._dynamo
from huggingface_hub import list_models
from torch.nn import functional as F
from PIL import Image

import gradio as gr
from diffusers import (
    FlowMatchEulerDiscreteScheduler,
    SASolverScheduler,
    DEISMultistepScheduler,
    DPMSolverMultistepInverseScheduler,
    UniPCMultistepScheduler,
    DPMSolverMultistepScheduler,
    DPMSolverSinglestepScheduler,
)
from diffusers.pipelines.wan.pipeline_wan_i2v import WanImageToVideoPipeline
from diffusers.utils.export_utils import export_to_video

from torchao.quantization import quantize_, Float8DynamicActivationFloat8WeightConfig, Int8WeightOnlyConfig
import aoti

os.environ["TOKENIZERS_PARALLELISM"] = "true"
warnings.filterwarnings("ignore")
IS_ZERO_GPU = bool(os.getenv("SPACES_ZERO_GPU"))

def auto_clear_console_logs():
    while True:
        time.sleep(86400)
        sys.stdout.write('\033[H\033[J')
        sys.stdout.flush()

log_clear_thread = threading.Thread(target=auto_clear_console_logs, daemon=True)
log_clear_thread.start()

# if IS_ZERO_GPU:
#     print("Loading...")
#     subprocess.run("rm -rf /data-nvme/zerogpu-offload/*", env={}, shell=True)

# --- FRAME EXTRACTION JS & LOGIC ---

# JS to grab timestamp from the output video
get_timestamp_js = """
function() {
    // Select the video element specifically inside the component with id 'generated-video'
    const video = document.querySelector('#generated-video video');
    
    if (video) {
        console.log("Video found! Time: " + video.currentTime);
        return video.currentTime;
    } else {
        console.log("No video element found.");
        return 0;
    }
}
"""


def extract_frame(video_path, timestamp):
    # Safety check: if no video is present
    if not video_path:
        return None
    
    print(f"Extracting frame at timestamp: {timestamp}") 
    
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        return None

    # Calculate frame number
    fps = cap.get(cv2.CAP_PROP_FPS)
    target_frame_num = int(float(timestamp) * fps)
    
    # Cap total frames to prevent errors at the very end of video
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if target_frame_num >= total_frames:
        target_frame_num = total_frames - 1
    
    # Set position
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame_num)
    ret, frame = cap.read()
    cap.release()
    
    if ret:
        # Convert from BGR (OpenCV) to RGB (Gradio)
        # Gradio Image component handles Numpy array -> PIL conversion automatically
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    return None

# --- END FRAME EXTRACTION LOGIC ---


def clear_vram():
    gc.collect()
    torch.cuda.empty_cache()


# RIFE
if not os.path.exists("RIFEv4.26_0921.zip"):
    print("Downloading RIFE Model...")
    subprocess.run([
        "wget", "-q",
        "https://huggingface.co/r3gm/RIFE/resolve/main/RIFEv4.26_0921.zip",
        "-O", "RIFEv4.26_0921.zip"
    ], check=True)
    subprocess.run(["unzip", "-o", "RIFEv4.26_0921.zip"], check=True)

# sys.path.append(os.getcwd())

from train_log.RIFE_HDv3 import Model
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
rife_model = Model()
rife_model.load_model("train_log", -1)
rife_model.eval()


@torch.no_grad()
def interpolate_bits(frames_np, multiplier=2, scale=1.0):
    """
    Interpolation maintaining Numpy Float 0-1 format.
    Args:
        frames_np: Numpy Array (Time, Height, Width, Channels) - Float32 [0.0, 1.0]
        multiplier: int (2, 4, 8)
    Returns:
        List of Numpy Arrays (Height, Width, Channels) - Float32 [0.0, 1.0]
    """
    
    # Handle input shape
    if isinstance(frames_np, list):
        # Convert list of arrays to one big array for easier shape handling if needed, 
        # but here we just grab dims from first frame
        T = len(frames_np)
        H, W, C = frames_np[0].shape
    else:
        T, H, W, C = frames_np.shape

    # 1. No Interpolation Case
    if multiplier < 2:
        # Just convert 4D array to list of 3D arrays
        if isinstance(frames_np, np.ndarray):
            return list(frames_np)
        return frames_np

    n_interp = multiplier - 1
    
    # Pre-calc padding for RIFE (requires dimensions divisible by 32/scale)
    tmp = max(128, int(128 / scale))
    ph = ((H - 1) // tmp + 1) * tmp
    pw = ((W - 1) // tmp + 1) * tmp
    padding = (0, pw - W, 0, ph - H)

    # Helper: Numpy (H, W, C) Float -> Tensor (1, C, H, W) Half
    def to_tensor(frame_np):
        # frame_np is float32 0-1
        t = torch.from_numpy(frame_np).to(device)
        # HWC -> CHW
        t = t.permute(2, 0, 1).unsqueeze(0)
        return F.pad(t, padding).half()

    # Helper: Tensor (1, C, H, W) Half -> Numpy (H, W, C) Float
    def from_tensor(tensor):
        # Crop padding
        t = tensor[0, :, :H, :W]
        # CHW -> HWC
        t = t.permute(1, 2, 0)
        # Keep as float32, range 0-1
        return t.float().cpu().numpy()

    def make_inference(I0, I1, n):
        if rife_model.version >= 3.9:
            res = []
            for i in range(n):
                res.append(rife_model.inference(I0, I1, (i+1) * 1. / (n+1), scale))
            return res
        else:
            middle = rife_model.inference(I0, I1, scale)
            if n == 1:
                return [middle]
            first_half = make_inference(I0, middle, n=n//2)
            second_half = make_inference(middle, I1, n=n//2)
            if n % 2:
                return [*first_half, middle, *second_half]
            else:
                return [*first_half, *second_half]

    output_frames = []

    # Process Frames
    # Load first frame into GPU
    I1 = to_tensor(frames_np[0])

    total_steps = T - 1

    with tqdm(total=total_steps, desc="Interpolating", unit="frame") as pbar:
    
        for i in range(total_steps):
            I0 = I1
            # Add original frame to output
            output_frames.append(from_tensor(I0))
    
            # Load next frame
            I1 = to_tensor(frames_np[i+1])
    
            # Generate intermediate frames
            mid_tensors = make_inference(I0, I1, n_interp)
    
            # Append intermediate frames
            for mid in mid_tensors:
                output_frames.append(from_tensor(mid))

            if (i + 1) % 50 == 0:
                pbar.update(50)
        pbar.update(total_steps % 50)
        
        # Add the very last frame
        output_frames.append(from_tensor(I1))
    
    # Cleanup
    del I0, I1, mid_tensors
    torch.cuda.empty_cache()

    return output_frames


# WAN

ORG_NAME = "TestOrganizationPleaseIgnore"
# MODEL_ID = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
MODEL_ID = os.getenv("REPO_ID") or random.choice(
    list(list_models(author=ORG_NAME, filter='diffusers:WanImageToVideoPipeline'))
).modelId
CACHE_DIR = os.path.expanduser("~/.cache/huggingface/")

LORA_MODELS = [
    # {
    #     "repo_id": "exampleuser/example_lora_1",
    #     "high_tr": "example_lora_1_high.safetensors",
    #     "low_tr": "example_lora_1_low.safetensors",
    #     "high_scale": 0.5,
    #     "low_scale": 0.5
    # },
    # {
    #     "repo_id": "exampleuser/example_lora_2",
    #     "high_tr": "subfolder/example_lora_2_high.safetensors",
    #     "low_tr": "subfolder/example_lora_2_low.safetensors",
    #     "high_scale": 0.4,
    #     "low_scale": 0.4
    # },
]

MAX_DIM = 832
MIN_DIM = 480
SQUARE_DIM = 640
MULTIPLE_OF = 16
MAX_SEED = np.iinfo(np.int32).max

FIXED_FPS = 16
MIN_FRAMES_MODEL = 8
MAX_FRAMES_MODEL = 160

MIN_DURATION = round(MIN_FRAMES_MODEL / FIXED_FPS, 1)
MAX_DURATION = round(MAX_FRAMES_MODEL / FIXED_FPS, 1)

SCHEDULER_MAP = {
    "FlowMatchEulerDiscrete": FlowMatchEulerDiscreteScheduler,
    "SASolver": SASolverScheduler,
    "DEISMultistep": DEISMultistepScheduler,
    "DPMSolverMultistepInverse": DPMSolverMultistepInverseScheduler,
    "UniPCMultistep": UniPCMultistepScheduler,
    "DPMSolverMultistep": DPMSolverMultistepScheduler,
    "DPMSolverSinglestep": DPMSolverSinglestepScheduler,
}

pipe = WanImageToVideoPipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.bfloat16,
).to('cuda')
original_scheduler = copy.deepcopy(pipe.scheduler)

for i, lora in enumerate(LORA_MODELS):
    name_high_tr = lora["high_tr"].split(".")[0].split("/")[-1] + "Hh"
    name_low_tr = lora["low_tr"].split(".")[0].split("/")[-1] + "Ll"
    
    try: 
        pipe.load_lora_weights(
            lora["repo_id"],
            weight_name=lora["high_tr"],
            adapter_name=name_high_tr
        )
    
        kwargs_lora = {"load_into_transformer_2": True}
        pipe.load_lora_weights(
            lora["repo_id"],
            weight_name=lora["low_tr"],
            adapter_name=name_low_tr,
            **kwargs_lora
        )
    
        pipe.set_adapters([name_high_tr, name_low_tr], adapter_weights=[1.0, 1.0])
    
        pipe.fuse_lora(adapter_names=[name_high_tr], lora_scale=lora["high_scale"], components=["transformer"])
        pipe.fuse_lora(adapter_names=[name_low_tr], lora_scale=lora["low_scale"], components=["transformer_2"])
    
        pipe.unload_lora_weights()

        print(f"Applied: {lora['high_tr']}, hs={lora['high_scale']}/ls={lora['low_scale']}, {i+1}/{len(LORA_MODELS)}") 
    except Exception as e:
        print("Error:", str(e))
        print("Failed LoRA:", name_high_tr)
        pipe.unload_lora_weights()


quantize_(pipe.text_encoder, Int8WeightOnlyConfig())
torch._dynamo.reset()
quantize_(pipe.transformer, Float8DynamicActivationFloat8WeightConfig())
torch._dynamo.reset()
quantize_(pipe.transformer_2, Float8DynamicActivationFloat8WeightConfig())
torch._dynamo.reset()

spaces.aoti_load(
    module=pipe.transformer,
    repo_id='cbensimon/WanTransformer3DModel-sm120-cu130-raa',
)
spaces.aoti_load(
    module=pipe.transformer_2,
    repo_id='cbensimon/WanTransformer3DModel-sm120-cu130-raa',
)


default_prompt_i2v = "high quality, high resolution, cinematic motion, smooth animation"
default_negative_prompt = "blurry, low quality, chaotic, deformed, watermark, bad anatomy, shaky camera view point"


def model_title():
    repo_name = MODEL_ID.split('/')[-1].replace("_", " ")
    url = f"https://huggingface.co/{MODEL_ID}"
    return f"## This space is not iframe anymore is currently running ZEROGPU [{repo_name}]({url}) 🐢"


def resize_image(image: Image.Image) -> Image.Image:
    width, height = image.size
    if width == height:
        return image.resize((SQUARE_DIM, SQUARE_DIM), Image.LANCZOS)
    
    aspect_ratio = width / height
    MAX_ASPECT_RATIO = MAX_DIM / MIN_DIM
    MIN_ASPECT_RATIO = MIN_DIM / MAX_DIM

    image_to_resize = image
    if aspect_ratio > MAX_ASPECT_RATIO:
        target_w, target_h = MAX_DIM, MIN_DIM
        crop_width = int(round(height * MAX_ASPECT_RATIO))
        left = (width - crop_width) // 2
        image_to_resize = image.crop((left, 0, left + crop_width, height))
    elif aspect_ratio < MIN_ASPECT_RATIO:
        target_w, target_h = MIN_DIM, MAX_DIM
        crop_height = int(round(width / MIN_ASPECT_RATIO))
        top = (height - crop_height) // 2
        image_to_resize = image.crop((0, top, width, top + crop_height))
    else:
        if width > height:
            target_w = MAX_DIM
            target_h = int(round(target_w / aspect_ratio))
        else:
            target_h = MAX_DIM
            target_w = int(round(target_h * aspect_ratio))

    final_w = round(target_w / MULTIPLE_OF) * MULTIPLE_OF
    final_h = round(target_h / MULTIPLE_OF) * MULTIPLE_OF
    final_w = max(MIN_DIM, min(MAX_DIM, final_w))
    final_h = max(MIN_DIM, min(MAX_DIM, final_h))
    return image_to_resize.resize((final_w, final_h), Image.LANCZOS)


def resize_and_crop_to_match(target_image, reference_image):
    ref_width, ref_height = reference_image.size
    target_width, target_height = target_image.size
    scale = max(ref_width / target_width, ref_height / target_height)
    new_width, new_height = int(target_width * scale), int(target_height * scale)
    resized = target_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    left, top = (new_width - ref_width) // 2, (new_height - ref_height) // 2
    return resized.crop((left, top, left + ref_width, top + ref_height))


def get_num_frames(duration_seconds: float):
    return 1 + int(np.clip(
        int(round(duration_seconds * FIXED_FPS)),
        MIN_FRAMES_MODEL,
        MAX_FRAMES_MODEL,
    ))


def get_inference_duration(
    resized_image,
    processed_last_image,
    prompt,
    steps,
    negative_prompt,
    num_frames,
    guidance_scale,
    guidance_scale_2,
    current_seed,
    scheduler_name,
    flow_shift,
    frame_multiplier,
    quality,
    duration_seconds,
    safe_mode,
    progress
):
    BASE_FRAMES_HEIGHT_WIDTH = 81 * 832 * 624
    BASE_STEP_DURATION = 5.
    width, height = resized_image.size
    factor = num_frames * width * height / BASE_FRAMES_HEIGHT_WIDTH
    step_duration = BASE_STEP_DURATION * factor ** 1.5
    gen_time = int(steps) * step_duration

    if guidance_scale > 1:
        gen_time = gen_time * 2.4

    frame_factor = frame_multiplier // FIXED_FPS
    if frame_factor > 1:
        total_out_frames = (num_frames * frame_factor) - num_frames
        inter_time = (total_out_frames * 0.02)
        gen_time += inter_time

    total_time = 15 + gen_time
    if safe_mode:
        total_time = total_time * 1.30

    return total_time


@spaces.GPU(duration=get_inference_duration, size='xlarge')
def run_inference(
    resized_image,
    processed_last_image,
    prompt,
    steps,
    negative_prompt,
    num_frames,
    guidance_scale,
    guidance_scale_2,
    current_seed,
    scheduler_name,
    flow_shift,
    frame_multiplier,
    quality,
    duration_seconds,
    safe_mode=False,
    progress=gr.Progress(track_tqdm=True),
):
    scheduler_class = SCHEDULER_MAP.get(scheduler_name)
    if scheduler_class.__name__ != pipe.scheduler.config._class_name or flow_shift != pipe.scheduler.config.get("flow_shift", "shift"):
        config = copy.deepcopy(original_scheduler.config)
        if scheduler_class == FlowMatchEulerDiscreteScheduler:
            config['shift'] = flow_shift
        else:
            config['flow_shift'] = flow_shift
        pipe.scheduler = scheduler_class.from_config(config)

    clear_vram()

    task_name = str(uuid.uuid4())[:8]
    print(f"Generating {num_frames} frames, task: {task_name}, {duration_seconds}, {resized_image.size}")
    start = time.time()
    result = pipe(
        image=resized_image,
        last_image=processed_last_image,
        prompt=prompt,
        negative_prompt=negative_prompt,
        height=resized_image.height,
        width=resized_image.width,
        num_frames=num_frames,
        guidance_scale=float(guidance_scale),
        guidance_scale_2=float(guidance_scale_2),
        num_inference_steps=int(steps),
        generator=torch.Generator(device="cuda").manual_seed(current_seed),
        output_type="np" 
    )
    print("gen time passed:", time.time() - start)
    
    raw_frames_np = result.frames[0] 
    pipe.scheduler = original_scheduler

    frame_factor = frame_multiplier // FIXED_FPS
    if frame_factor > 1:
        start = time.time()
        print(f"Processing frames (RIFE Multiplier: {frame_factor}x)...")
        rife_model.device()
        rife_model.flownet = rife_model.flownet.half()
        final_frames = interpolate_bits(raw_frames_np, multiplier=int(frame_factor))
        print("Interpolation time passed:", time.time() - start)
    else:
        final_frames = list(raw_frames_np)

    final_fps = FIXED_FPS * int(frame_factor)

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmpfile:
        video_path = tmpfile.name

    start = time.time()
    with tqdm(total=3, desc="Rendering Media", unit="clip") as pbar:
        pbar.update(2)
        export_to_video(final_frames, video_path, fps=final_fps, quality=quality)
        pbar.update(1)
    print(f"Export time passed, {final_fps} FPS:", time.time() - start)

    return video_path, task_name


def generate_video(
    input_image,
    last_image,
    prompt,
    steps=4,
    negative_prompt=default_negative_prompt,
    duration_seconds=MAX_DURATION,
    guidance_scale=1,
    guidance_scale_2=1,
    seed=42,
    randomize_seed=False,
    quality=5,
    scheduler="UniPCMultistep",
    flow_shift=6.0,
    frame_multiplier=16,
    safe_mode=False,
    video_component=True,
    progress=gr.Progress(track_tqdm=True),
):
    """
    Generate a video from an input image using the Wan 2.2 14B I2V model with Lightning LoRA.
    This function takes an input image and generates a video animation based on the provided
    prompt and parameters. It uses an FP8 qunatized Wan 2.2 14B Image-to-Video model in with Lightning LoRA
    for fast generation in 4-8 steps.
    Args:
        input_image (PIL.Image): The input image to animate. Will be resized to target dimensions.
        last_image (PIL.Image, optional): The optional last image for the video.
        prompt (str): Text prompt describing the desired animation or motion.
        steps (int, optional): Number of inference steps. More steps = higher quality but slower.
            Defaults to 4. Range: 1-30.
        negative_prompt (str, optional): Negative prompt to avoid unwanted elements.
            Defaults to default_negative_prompt (contains unwanted visual artifacts).
        duration_seconds (float, optional): Duration of the generated video in seconds.
            Defaults to 2. Clamped between MIN_FRAMES_MODEL/FIXED_FPS and MAX_FRAMES_MODEL/FIXED_FPS.
        guidance_scale (float, optional): Controls adherence to the prompt. Higher values = more adherence.
            Defaults to 1.0. Range: 0.0-20.0.
        guidance_scale_2 (float, optional): Controls adherence to the prompt. Higher values = more adherence.
            Defaults to 1.0. Range: 0.0-20.0.
        seed (int, optional): Random seed for reproducible results. Defaults to 42.
            Range: 0 to MAX_SEED (2147483647).
        randomize_seed (bool, optional): Whether to use a random seed instead of the provided seed.
            Defaults to False.
        quality (float, optional): Video output quality. Default is 5. Uses variable bit rate.
            Highest quality is 10, lowest is 1.
        scheduler (str, optional): The name of the scheduler to use for inference. Defaults to "UniPCMultistep".
        flow_shift (float, optional): The flow shift value for compatible schedulers. Defaults to 6.0.
        frame_multiplier (int, optional): The int value for fps enhancer
        video_component(bool, optional): Show video player in output.
            Defaults to True.
        progress (gr.Progress, optional): Gradio progress tracker. Defaults to gr.Progress(track_tqdm=True).
    Returns:
        tuple: A tuple containing:
            - video_path (str): Path for the video component.
            - video_path (str): Path for the file download component. Attempt to avoid reconversion in video component.
            - current_seed (int): The seed used for generation.
    Raises:
        gr.Error: If input_image is None (no image uploaded).
    Note:
        - Frame count is calculated as duration_seconds * FIXED_FPS (24)
        - Output dimensions are adjusted to be multiples of MOD_VALUE (32)
        - The function uses GPU acceleration via the @spaces.GPU decorator
        - Generation time varies based on steps and duration (see get_duration function)
    """
    
    if input_image is None:
        raise gr.Error("Please upload an input image.")

    num_frames = get_num_frames(duration_seconds)
    current_seed = random.randint(0, MAX_SEED) if randomize_seed else int(seed)
    resized_image = resize_image(input_image)

    processed_last_image = None
    if last_image:
        processed_last_image = resize_and_crop_to_match(last_image, resized_image)

    video_path, task_n = run_inference(
        resized_image,
        processed_last_image,
        prompt,
        steps,
        negative_prompt,
        num_frames,
        guidance_scale,
        guidance_scale_2,
        current_seed,
        scheduler,
        flow_shift,
        frame_multiplier,
        quality,
        duration_seconds,
        safe_mode,
        progress,
    )
    print(f"GPU complete: {task_n}")

    return (video_path if video_component else None), video_path, current_seed


CSS = """
#hidden-timestamp {
    opacity: 0;
    height: 0px;
    width: 0px;
    margin: 0px;
    padding: 0px;
    overflow: hidden;
    position: absolute;
    pointer-events: none;
}
"""


with gr.Blocks(delete_cache=(3600, 10800)) as demo:
    gr.Markdown(model_title())
    gr.Markdown("Run Wan 2.2 in just 4-8 steps, fp8 quantization & AoT compilation - compatible with 🧨 diffusers and ZeroGPU")

    with gr.Row():
        with gr.Column():
            input_image_component = gr.Image(type="pil", label="Input Image", sources=["upload", "clipboard"])
            prompt_input = gr.Textbox(label="Prompt", value=default_prompt_i2v)
            duration_seconds_input = gr.Slider(minimum=MIN_DURATION, maximum=MAX_DURATION, step=0.1, value=3.5, label="Duration (seconds)", info=f"Clamped to model's {MIN_FRAMES_MODEL}-{MAX_FRAMES_MODEL} frames at {FIXED_FPS}fps.")
            frame_multi = gr.Dropdown(
                choices=[FIXED_FPS, FIXED_FPS*2, FIXED_FPS*4, FIXED_FPS*8],
                value=FIXED_FPS,
                label="Video Fluidity (Frames per Second)",
                info="Extra frames will be generated using flow estimation, which estimates motion between frames to make the video smoother."
            )
            safe_mode_checkbox = gr.Checkbox(
                label="🛠️ Safe Mode if you want",
                value=False,
                info="Requests 30% extra processing time to try to prevent unfinished tasks when the server is busy."
            )
            with gr.Accordion("Advanced Settings", open=False):
                last_image_component = gr.Image(type="pil", label="Last Image (Optional)", sources=["upload", "clipboard"])
                negative_prompt_input = gr.Textbox(label="Negative Prompt", value=default_negative_prompt, info="Used if any Guidance Scale > 1.", lines=3)
                quality_slider = gr.Slider(minimum=1, maximum=10, step=1, value=5, label="Video Quality", info="If set to 10, the generated video may be too large and won't play in the Gradio preview.")
                seed_input = gr.Slider(label="Seed", minimum=0, maximum=MAX_SEED, step=1, value=42, interactive=True)
                randomize_seed_checkbox = gr.Checkbox(label="Randomize seed", value=True, interactive=True)
                steps_slider = gr.Slider(minimum=1, maximum=10, step=1, value=4, label="Inference Steps")
                guidance_scale_input = gr.Slider(minimum=0.0, maximum=5.0, step=0.1, value=1, label="Guidance Scale - high noise stage", info="Values above 1 increase GPU usage and may take longer to process.")
                guidance_scale_2_input = gr.Slider(minimum=0.0, maximum=5.0, step=0.1, value=1, label="Guidance Scale 2 - low noise stage")
                scheduler_dropdown = gr.Dropdown(
                    label="Scheduler",
                    choices=list(SCHEDULER_MAP.keys()),
                    value="UniPCMultistep",
                    info="Select a custom scheduler."
                )
                flow_shift_slider = gr.Slider(minimum=0.5, maximum=15.0, step=0.1, value=3.0, label="Flow Shift")
                play_result_video = gr.Checkbox(label="Display result", value=True, interactive=True)
                gr.Markdown(f"[ZeroGPU help, tips and troubleshooting](https://huggingface.co/datasets/{ORG_NAME}/help/blob/main/gpu_help.md)")
                gr.Markdown(
                    "To use a different model, **duplicate this Space** first, then change the `REPO_ID` environment variable. "
                    "[See compatible models here](https://huggingface.co/models?other=diffusers:WanImageToVideoPipeline&sort=trending&search=WAN2.2_I2V_LIGHTNING)."
                )

            generate_button = gr.Button("Generate Video", variant="primary")

        with gr.Column():
            video_output = gr.Video(label="Generated Video", autoplay=True, sources=["upload"], buttons=["download", "share"], interactive=True, elem_id="generated-video")
            
            with gr.Row():
                grab_frame_btn = gr.Button("📸 Use Current Frame as Input", variant="secondary")
                timestamp_box = gr.Number(value=0, label="Timestamp", visible=True, elem_id="hidden-timestamp")
            
            file_output = gr.File(label="Download Video")

    ui_inputs = [
        input_image_component, last_image_component, prompt_input, steps_slider,
        negative_prompt_input, duration_seconds_input,
        guidance_scale_input, guidance_scale_2_input, seed_input, randomize_seed_checkbox,
        quality_slider, scheduler_dropdown, flow_shift_slider, frame_multi,
        safe_mode_checkbox,
        play_result_video
    ]
    
    generate_button.click(
        fn=generate_video, 
        inputs=ui_inputs, 
        outputs=[video_output, file_output, seed_input]
    )
    

    grab_frame_btn.click(
        fn=None,
        inputs=None,
        outputs=[timestamp_box],
        js=get_timestamp_js
    )
    
    timestamp_box.change(
        fn=extract_frame,
        inputs=[video_output, timestamp_box],
        outputs=[input_image_component]
    )

if __name__ == "__main__":
    demo.queue().launch(
        mcp_server=True,
        css=CSS,
        show_error=True,
        ssr_mode=False,
    )