import cv2
import os
import json

def extract_flower_frames():
    video_path = r'D:\PROJETOS\PYCHARM\MannaVision2\348656_medium.mp4'
    output_dir = r'D:\PROJETOS\PYCHARM\MannaVision2\handraw-pipe\public\experiences\flower'
    os.makedirs(output_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error opening video: {video_path}")
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Video info: {total_frames} frames, {fps} fps, {orig_w}x{orig_h}")

    # We want around 100 to 130 frames for smooth scrubbing
    # Step = total_frames / 120 (e.g. 520 / 120 = 4.33 -> sample every ~4th frame)
    target_count = 130
    indices_to_save = set([int(i * (total_frames - 1) / (target_count - 1)) for i in range(target_count)])

    frame_idx = 0
    saved_count = 0
    saved_filenames = []

    # Target resolution: 1280x720 HD
    target_w, target_h = 1280, 720

    print("Extracting frames sequentially...")
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx in indices_to_save:
            resized = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
            filename = f"frame_{saved_count:03d}.jpg"
            filepath = os.path.join(output_dir, filename)
            cv2.imwrite(filepath, resized, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            saved_filenames.append(f"/experiences/flower/{filename}")
            saved_count += 1

        frame_idx += 1

    cap.release()
    print(f"Done! Saved {saved_count} frames to {output_dir}")

    # Save manifest
    manifest = {
        "id": "flower",
        "title": "Desabrochar da Flor",
        "frameCount": saved_count,
        "width": target_w,
        "height": target_h,
        "frames": saved_filenames
    }
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest written to {manifest_path}")

if __name__ == '__main__':
    extract_flower_frames()
